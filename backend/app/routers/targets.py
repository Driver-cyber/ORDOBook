from collections import defaultdict
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.targets import ClientTarget, ScoreboardEntry, ScoreboardPage
from app.models.forecast_period import ForecastPeriod
from app.models.monthly_actuals import MonthlyActuals
from app.engine.targets import compute_target_derived, COMPUTED_KEYS
from app.schemas.targets import (
    TargetsUpsertRequest, TargetsResponse, TargetOut, TargetNoteUpdate,
    ScoreboardResponse, GradeOverrideRequest,
    MetricTextUpdate, ScoreboardTextUpdate,
)

router = APIRouter(prefix="/api/clients", tags=["targets"])

# ---------------------------------------------------------------------------
# Metric definitions — single source of truth for scoreboard structure
# ---------------------------------------------------------------------------
SCOREBOARD_METRICS = [
    # P&L
    {"key": "revenue",              "label": "Revenue",               "type": "cents", "higher_is_better": True,  "section": "P&L",        "agg": "sum"},
    {"key": "cost_of_sales",        "label": "Cost of Sales",         "type": "cents", "higher_is_better": False, "section": "P&L",        "agg": "sum"},
    {"key": "gross_profit",         "label": "Gross Profit",          "type": "cents", "higher_is_better": True,  "section": "P&L",        "agg": "sum"},
    {"key": "payroll_expenses",     "label": "Payroll Expenses",      "type": "cents", "higher_is_better": False, "section": "P&L",        "agg": "sum"},
    {"key": "marketing_expenses",   "label": "Marketing Expenses",    "type": "cents", "higher_is_better": False, "section": "P&L",        "agg": "sum"},
    {"key": "overhead_expenses",    "label": "Overhead Expenses",     "type": "cents", "higher_is_better": False, "section": "P&L",        "agg": "sum"},
    {"key": "net_operating_profit", "label": "Net Operating Profit",  "type": "cents", "higher_is_better": True,  "section": "P&L",        "agg": "sum"},
    {"key": "net_profit",           "label": "Net Profit",            "type": "cents", "higher_is_better": True,  "section": "P&L",        "agg": "sum"},
    # Operations
    {"key": "total_jobs",           "label": "Total Jobs",            "type": "count", "higher_is_better": True,  "section": "Operations", "agg": "sum"},
    {"key": "blended_avg_job_value","label": "Avg Job Value",         "type": "cents", "higher_is_better": True,  "section": "Operations", "agg": "weighted_avg"},
    # Cash Flow
    {"key": "dso_days",             "label": "DSO (Days)",            "type": "days",  "higher_is_better": False, "section": "Cash Flow",  "agg": "avg"},
    {"key": "dio_days",             "label": "DIO (Days)",            "type": "days",  "higher_is_better": False, "section": "Cash Flow",  "agg": "avg"},
    {"key": "dpo_days",             "label": "DPO (Days)",            "type": "days",  "higher_is_better": True,  "section": "Cash Flow",  "agg": "avg"},
    {"key": "cf_assets_change",     "label": "CF: Asset Changes",     "type": "cents", "higher_is_better": True,  "section": "Cash Flow",  "agg": "sum",          "computed": True},
    {"key": "cf_liabilities_change","label": "CF: Liability Changes", "type": "cents", "higher_is_better": True,  "section": "Cash Flow",  "agg": "sum",          "computed": True},
    {"key": "net_cash_flow",        "label": "Net Cash Flow",         "type": "cents", "higher_is_better": True,  "section": "Cash Flow",  "agg": "sum"},
    # Signed cash: a draw is negative, an investment positive. From the cash
    # perspective the Scoreboard takes, higher (less negative) is better.
    {"key": "owner_total_draws",    "label": "Owner Investments/(Draws)", "type": "cents", "higher_is_better": True,  "section": "Cash Flow",  "agg": "sum"},
]

SECTION_ORDER = ["P&L", "Operations", "Cash Flow"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_metric_value(period: ForecastPeriod, key: str) -> int:
    """Extract a metric value from a ForecastPeriod, handling computed composites."""
    if key == "total_jobs":
        return period.total_job_count or 0
    if key == "cf_assets_change":
        # Increase in assets = cash outflow → negate so positive = cash favorable
        return -((period.ar_change or 0) + (period.inventory_change or 0) + (period.other_current_assets_change or 0))
    if key == "cf_liabilities_change":
        # Increase in liabilities = cash inflow → positive = cash favorable
        return (period.ap_change or 0) + (period.current_debt_change or 0) + (period.long_term_debt_change or 0)
    return getattr(period, key, 0) or 0


def _aggregate_actuals(actuals: list, opening_bs=None) -> dict:
    """
    Aggregate MonthlyActuals records into a metric_key → int|None dict for the
    Targets page prior-year comparison column.

    Cash-flow comparison values are derived here rather than left blank:
      - DSO/DIO/DPO come from the year-end balance against the annual flow.
      - Balance *changes* (CF asset/liability, net cash flow, owner draws) need an
        opening balance sheet — December of the year before `actuals`. Pass it as
        `opening_bs`; without it those stay None rather than showing an untraceable
        number.
    """
    if not actuals:
        return {}

    # Year-end balance sheet = the latest month present in the set.
    _latest = max(actuals, key=lambda a: a.month)
    latest_bs = {
        "cash": _latest.cash or 0,
        "accounts_receivable": _latest.accounts_receivable or 0,
        "inventory": _latest.inventory or 0,
        "accounts_payable": _latest.accounts_payable or 0,
        "equity": _total_equity(_latest),
    }
    total_jobs = sum(a.job_count or 0 for a in actuals)
    total_revenue = sum(a.revenue or 0 for a in actuals)
    total_cos = sum(a.cost_of_sales or 0 for a in actuals)
    gross_profit = total_revenue - total_cos
    total_payroll = sum(a.payroll_expenses or 0 for a in actuals)
    total_marketing = sum(a.marketing_expenses or 0 for a in actuals)
    total_overhead = sum(a.overhead_expenses or 0 for a in actuals)
    total_other_ie = sum(a.other_income_expense or 0 for a in actuals)
    # net_profit_for_year is the QB Balance Sheet equity line: a cumulative YTD figure, NOT monthly.
    # Summing all months would inflate the result. Use the latest imported month's value,
    # which is the best available approximation of full-year net profit.
    actuals_with_np = [a for a in actuals if (a.net_profit_for_year or 0) != 0]
    if actuals_with_np:
        total_net_profit = max(actuals_with_np, key=lambda a: a.month).net_profit_for_year or 0
    else:
        total_net_profit = 0
    # net_op = net_profit - other_income_expense (algebraically equivalent to GP - total_expenses)
    net_op_profit = total_net_profit - total_other_ie

    # Balance-sheet movements need an opening position to measure against.
    cf_assets_change = cf_liabilities_change = net_cash_flow = owner_draws = None
    if opening_bs:
        ar_change = latest_bs["accounts_receivable"] - (opening_bs.get("accounts_receivable") or 0)
        inv_change = latest_bs["inventory"] - (opening_bs.get("inventory") or 0)
        ap_change = latest_bs["accounts_payable"] - (opening_bs.get("accounts_payable") or 0)
        # Signed positive-favorable, matching the Targets page convention.
        cf_assets_change = -(ar_change + inv_change)
        cf_liabilities_change = ap_change
        net_cash_flow = latest_bs["cash"] - (opening_bs.get("cash") or 0)
        # Equity roll-forward: opening + net profit + owner activity = closing, so
        # owner activity = closing − opening − net profit. Returned SIGNED to match
        # the "Investments or (Draws) by Owner" convention: draws negative,
        # investments positive. Fallback only — the mapped balance below wins.
        owner_draws = latest_bs["equity"] - (opening_bs.get("equity") or 0) - total_net_profit

    # Mapped owner activity: QB's YTD equity line for draws / distributions /
    # contributions, already signed. Like net_profit_for_year it is a running
    # balance, so the year-end figure is the latest month that carries one.
    # Zero everywhere means the account isn't mapped yet — keep the roll-forward.
    actuals_with_od = [a for a in actuals if (a.owner_distributions or 0) != 0]
    if actuals_with_od:
        owner_draws = max(actuals_with_od, key=lambda a: a.month).owner_distributions or 0

    return {
        "revenue": total_revenue,
        "cost_of_sales": total_cos,
        "gross_profit": gross_profit,
        "payroll_expenses": total_payroll,
        "marketing_expenses": total_marketing,
        "overhead_expenses": total_overhead,
        "net_operating_profit": net_op_profit,
        "other_income_expense": total_other_ie,
        "net_profit": total_net_profit,
        "total_jobs": total_jobs,
        "blended_avg_job_value": total_revenue // total_jobs if total_jobs > 0 else 0,
        # Days ratios are derivable from the year-end balance sheet and the annual
        # flow, using the same relationship the Targets page inverts to project
        # working capital (AR = Revenue / 365 × DSO).
        "dso_days": _days_ratio(latest_bs.get("accounts_receivable"), total_revenue),
        "dio_days": _days_ratio(latest_bs.get("inventory"), total_cos),
        "dpo_days": _days_ratio(latest_bs.get("accounts_payable"), total_cos),
        # These need an opening balance sheet (December of the year before) to
        # compute a true change. Left None when it isn't available rather than
        # showing a number that can't be traced to a source.
        "cf_assets_change": cf_assets_change,
        "cf_liabilities_change": cf_liabilities_change,
        "net_cash_flow": net_cash_flow,
        "owner_total_draws": owner_draws,
    }


def _days_ratio(balance: int | None, annual_flow: int) -> int | None:
    """Days outstanding implied by a year-end balance against an annual flow."""
    if not balance or annual_flow <= 0:
        return None
    return round(balance / (annual_flow / 365))


def _aggregate_forecast_for_targets(periods: list) -> dict:
    """
    Aggregate ForecastPeriod records into a metric_key → int dict for the
    Targets page current-year forecast comparison column.
    """
    if not periods:
        return {}
    result = {}
    for metric in SCOREBOARD_METRICS:
        result[metric["key"]] = _aggregate(periods, metric)
    # other_income_expense is not in SCOREBOARD_METRICS but needed on Targets page
    result["other_income_expense"] = sum(p.other_income_expense or 0 for p in periods)
    return result


def _aggregate(periods: list, metric: dict) -> int:
    if not periods:
        return 0
    key = metric["key"]
    agg = metric.get("agg", "sum")
    if agg == "sum":
        return sum(_get_metric_value(p, key) for p in periods)
    elif agg == "avg":
        vals = [_get_metric_value(p, key) for p in periods]
        return sum(vals) // len(vals)
    elif agg == "weighted_avg":
        # blended_avg_job_value = total revenue / total jobs across the period set
        total_rev = sum(_get_metric_value(p, "revenue") for p in periods)
        total_jobs = sum(_get_metric_value(p, "total_jobs") for p in periods)
        return total_rev // total_jobs if total_jobs > 0 else 0
    return 0


def _compute_grade(actual: int, prorated_target: int, higher_is_better: bool) -> Optional[str]:
    """Auto-assign a grade from the favourable variance vs the prorated target.

    Graded on _variance_pct — the difference in the favourable direction over
    |target| — rather than on actual/target. For a positive target the two are
    identical (ratio >= 0.95 is exactly variance >= -5%), but a ratio of two
    negative numbers compares magnitudes and grades signed cash metrics
    backwards: a -80k draw against a -95k target is a smaller draw (good), yet
    ratio 0.84 read as "missed". Cash-perspective metrics — owner draws, CF asset
    and liability changes, net cash flow — regularly carry negative targets.

    Thresholds: green >= -5%, yellow >= -20%, red below — evaluated in integer
    arithmetic (20·diff >= -|target| is exactly diff/|target| >= -5%), so there
    is no float rounding at the boundary and, for a positive target, the result
    is identical to the former ratio rule in every case. _variance_pct rounds
    for display only and is not used for grading.
    """
    if prorated_target == 0:
        return None
    diff = (actual - prorated_target) if higher_is_better else (prorated_target - actual)
    limit = abs(prorated_target)
    if 20 * diff >= -limit:
        return "green"
    if 5 * diff >= -limit:
        return "yellow"
    return "red"


def _variance_pct(actual: int, prorated_target: int, higher_is_better: bool) -> Optional[float]:
    """
    Returns variance % where POSITIVE always means FAVORABLE vs target,
    regardless of metric direction. Frontend can display without needing
    to know the direction.
    """
    if prorated_target == 0:
        return None
    raw = (actual - prorated_target) / abs(prorated_target) * 100
    return round(raw if higher_is_better else -raw, 1)


def _total_equity(rec) -> int:
    """Total equity of a MonthlyActuals row: retained equity + owner activity + YTD net income.

    Each piece is a QB equity line. owner_distributions is signed (draws negative),
    so it adds; before the account is mapped it is 0 and the sum is unchanged.
    """
    return ((rec.equity_before_net_profit or 0)
            + (rec.owner_distributions or 0)
            + (rec.net_profit_for_year or 0))


def _ending_balances(rec) -> dict:
    """Full balance sheet from a MonthlyActuals row (cents)."""
    return {
        "cash": rec.cash or 0,
        "accounts_receivable": rec.accounts_receivable or 0,
        "inventory": rec.inventory or 0,
        "other_current_assets": rec.other_current_assets or 0,
        "total_fixed_assets": rec.total_fixed_assets or 0,
        "total_other_long_term_assets": rec.total_other_long_term_assets or 0,
        "accounts_payable": rec.accounts_payable or 0,
        "other_current_liabilities": rec.other_current_liabilities or 0,
        "total_long_term_liabilities": rec.total_long_term_liabilities or 0,
        # Equity = retained equity + owner activity + current year net income
        "equity": _total_equity(rec),
    }


def _prior_ending(client_id: int, year: int, db: Session) -> dict:
    """December ending balance sheet of the prior year — basis for the projected BS."""
    prior_dec = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == client_id,
        MonthlyActuals.fiscal_year == year - 1,
        MonthlyActuals.month == 12,
    ).first()
    return _ending_balances(prior_dec) if prior_dec else {}


def _annual_targets(client_id: int, year: int, db: Session) -> dict:
    """metric_key -> annual target, drivers as stored plus derived metrics.

    Single source of truth for grading: computed metrics (revenue, net cash flow…)
    are never read from the database — they are derived from the drivers here,
    exactly as the Targets page shows them. Derived keys are only present once at
    least one driver has been set, so an empty target sheet still reads as
    'no target' rather than a target of zero.
    """
    rows = db.query(ClientTarget).filter(
        ClientTarget.client_id == client_id,
        ClientTarget.fiscal_year == year,
    ).all()
    drivers = {t.metric_key: t.target_value for t in rows if t.metric_key not in COMPUTED_KEYS}
    if not drivers:
        return {}
    derived = compute_target_derived(drivers, _prior_ending(client_id, year, db))
    return {**drivers, **{k: derived[k] for k in COMPUTED_KEYS}}


# ---------------------------------------------------------------------------
# Endpoints — Targets
# ---------------------------------------------------------------------------

@router.get("/{client_id}/targets/{year}", response_model=TargetsResponse)
def get_targets(client_id: int, year: int, db: Session = Depends(get_db)):
    targets = db.query(ClientTarget).filter(
        ClientTarget.client_id == client_id,
        ClientTarget.fiscal_year == year,
    ).all()

    # Prior year actuals for comparison column (all months, any status)
    prior_actuals = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == client_id,
        MonthlyActuals.fiscal_year == year - 1,
    ).all()


    # December two years back — the opening position for the prior-year comparison
    # column, so its cash-flow movements can be measured. May not be imported.
    prior_open_dec = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == client_id,
        MonthlyActuals.fiscal_year == year - 2,
        MonthlyActuals.month == 12,
    ).first()
    prior_opening: dict | None = None
    if prior_open_dec:
        prior_opening = {
            "cash": prior_open_dec.cash or 0,
            "accounts_receivable": prior_open_dec.accounts_receivable or 0,
            "inventory": prior_open_dec.inventory or 0,
            "accounts_payable": prior_open_dec.accounts_payable or 0,
            "equity": _total_equity(prior_open_dec),
        }

    prior_ending = _prior_ending(client_id, year, db)

    # Current year forecast for comparison column
    forecast_periods = db.query(ForecastPeriod).filter(
        ForecastPeriod.client_id == client_id,
        ForecastPeriod.fiscal_year == year,
    ).all()

    # `targets` keeps every row, including legacy computed-key rows that carry a
    # note — the note lives there. Their target_value is ignored: computed
    # metrics come from `derived`.
    drivers = {t.metric_key: t.target_value for t in targets if t.metric_key not in COMPUTED_KEYS}
    derived = compute_target_derived(drivers, prior_ending) if drivers else {}
    return TargetsResponse(
        fiscal_year=year,
        targets=[TargetOut.model_validate(t) for t in targets],
        prior_year_actuals=_aggregate_actuals(prior_actuals, opening_bs=prior_opening),
        current_year_forecast=_aggregate_forecast_for_targets(forecast_periods),
        prior_year_ending_balances=prior_ending,
        derived=derived,
    )


@router.put("/{client_id}/targets/{year}", response_model=TargetsResponse)
def upsert_targets(client_id: int, year: int, body: TargetsUpsertRequest, db: Session = Depends(get_db)):
    existing = {
        t.metric_key: t
        for t in db.query(ClientTarget).filter(
            ClientTarget.client_id == client_id,
            ClientTarget.fiscal_year == year,
        ).all()
    }
    for item in body.targets:
        if item.metric_key in COMPUTED_KEYS:
            continue  # derived, never stored
        if item.metric_key in existing:
            rec = existing[item.metric_key]
            rec.target_value = item.target_value
            rec.target_type = item.target_type
        else:
            db.add(ClientTarget(
                client_id=client_id,
                fiscal_year=year,
                metric_key=item.metric_key,
                target_value=item.target_value,
                target_type=item.target_type,
            ))
    db.commit()
    return get_targets(client_id, year, db)


@router.patch("/{client_id}/targets/{year}/note", response_model=TargetOut)
def update_target_note(client_id: int, year: int, body: TargetNoteUpdate,
                       db: Session = Depends(get_db)):
    """Save the advisor note for one metric.

    Deliberately separate from the targets upsert: notes autosave as the advisor
    types, and routing them through the bulk upsert would silently commit target
    edits that haven't been saved yet.

    A note can be written before a target exists, so the row is created with a
    zero target when needed — a zero target grades as None, exactly like a missing
    one, so this never introduces a spurious red on the Scoreboard.
    """
    rec = db.query(ClientTarget).filter(
        ClientTarget.client_id == client_id,
        ClientTarget.fiscal_year == year,
        ClientTarget.metric_key == body.metric_key,
    ).first()

    if rec is None:
        rec = ClientTarget(
            client_id=client_id,
            fiscal_year=year,
            metric_key=body.metric_key,
            target_value=0,
            target_type="cents",
        )
        db.add(rec)

    rec.notes = (body.notes or "").strip() or None
    db.commit()
    db.refresh(rec)
    return TargetOut.model_validate(rec)


# ---------------------------------------------------------------------------
# Endpoints — Scoreboard
# ---------------------------------------------------------------------------

@router.get("/{client_id}/scoreboard/{year}", response_model=ScoreboardResponse)
def get_scoreboard(client_id: int, year: int, db: Session = Depends(get_db)):
    # All forecast periods for this year
    all_periods = db.query(ForecastPeriod).filter(
        ForecastPeriod.client_id == client_id,
        ForecastPeriod.fiscal_year == year,
    ).order_by(ForecastPeriod.month).all()

    actual_periods = [p for p in all_periods if p.source_type == "actual"]
    months_elapsed = len(actual_periods)

    # Prior year actuals for comparison column
    prior_periods = db.query(ForecastPeriod).filter(
        ForecastPeriod.client_id == client_id,
        ForecastPeriod.fiscal_year == year - 1,
        ForecastPeriod.source_type == "actual",
    ).order_by(ForecastPeriod.month).all()

    # Targets (drivers + derived, one source of truth) and stored grades
    annual_targets = _annual_targets(client_id, year, db)
    grades_map = {
        g.metric_key: g
        for g in db.query(ScoreboardEntry).filter(
            ScoreboardEntry.client_id == client_id,
            ScoreboardEntry.fiscal_year == year,
        ).all()
    }

    red_count = yellow_count = green_count = 0
    sections_data: dict[str, list] = defaultdict(list)

    for metric in SCOREBOARD_METRICS:
        key = metric["key"]
        higher = metric["higher_is_better"]

        ytd_actual = _aggregate(actual_periods, metric)
        full_year_forecast = _aggregate(all_periods, metric)
        prior_year_total = _aggregate(prior_periods, metric) if prior_periods else None

        annual_target = annual_targets.get(key)
        has_target = annual_target is not None

        prorated_target = None
        variance_pct = None
        variance_abs = None
        if has_target and months_elapsed > 0:
            prorated_target = int(annual_target * months_elapsed / 12)
            if prorated_target != 0:
                variance_abs = ytd_actual - prorated_target
                variance_pct = _variance_pct(ytd_actual, prorated_target, higher)

        # Determine grade: override takes precedence, otherwise auto-compute
        entry = grades_map.get(key)
        grade_is_override = entry.grade_is_override if entry else False
        is_top_priority = entry.is_top_priority if entry else False
        notes = entry.notes if entry else None
        priority_reason = entry.priority_reason if entry else None
        action_item = entry.action_item if entry else None

        if entry and grade_is_override:
            grade = entry.grade
        elif has_target and prorated_target is not None and prorated_target != 0 and months_elapsed > 0:
            grade = _compute_grade(ytd_actual, prorated_target, higher)
        else:
            grade = None

        if grade == "red":
            red_count += 1
        elif grade == "yellow":
            yellow_count += 1
        elif grade == "green":
            green_count += 1

        sections_data[metric["section"]].append({
            "key": key,
            "label": metric["label"],
            "type": metric["type"],
            "higher_is_better": higher,
            "prior_year_total": prior_year_total,
            "ytd_actual": ytd_actual,
            "full_year_forecast": full_year_forecast,
            "annual_target": annual_target,
            "prorated_target": prorated_target,
            "variance_pct": variance_pct,
            "variance_abs": variance_abs,
            "grade": grade,
            "grade_is_override": grade_is_override,
            "is_top_priority": is_top_priority,
            "notes": notes,
            "has_target": has_target,
            "priority_reason": priority_reason,
            "action_item": action_item,
        })

    overall_grade = None
    if red_count > 0:
        overall_grade = "red"
    elif yellow_count > 0:
        overall_grade = "yellow"
    elif green_count > 0:
        overall_grade = "green"

    sections = [
        {"name": s, "metrics": sections_data[s]}
        for s in SECTION_ORDER
        if s in sections_data
    ]

    page = db.query(ScoreboardPage).filter(
        ScoreboardPage.client_id == client_id, ScoreboardPage.fiscal_year == year,
    ).first()

    return ScoreboardResponse(
        fiscal_year=year,
        months_elapsed=months_elapsed,
        overall_grade=overall_grade,
        red_count=red_count,
        yellow_count=yellow_count,
        green_count=green_count,
        sections=sections,
        headline=page.headline if page else None,
    )


@router.patch("/{client_id}/scoreboard/{year}/text")
def set_scoreboard_text(client_id: int, year: int, body: ScoreboardTextUpdate,
                        db: Session = Depends(get_db)):
    """Advisor headline for the year's Scoreboard. Empty clears it (auto wording returns)."""
    page = db.query(ScoreboardPage).filter(
        ScoreboardPage.client_id == client_id, ScoreboardPage.fiscal_year == year,
    ).first()
    if page is None:
        page = ScoreboardPage(client_id=client_id, fiscal_year=year)
        db.add(page)
    if body.headline is not None:
        page.headline = body.headline.strip() or None
    db.commit()
    return {"status": "ok", "headline": page.headline}


@router.patch("/{client_id}/scoreboard/{year}/metric-text")
def set_metric_text(client_id: int, year: int, body: MetricTextUpdate,
                    db: Session = Depends(get_db)):
    """Client-facing reason / action item for one metric. Separate from the grade
    route so autosaving text never touches a grade or its override flag. Empty
    string clears a field back to the auto wording."""
    entry = db.query(ScoreboardEntry).filter(
        ScoreboardEntry.client_id == client_id,
        ScoreboardEntry.fiscal_year == year,
        ScoreboardEntry.metric_key == body.metric_key,
    ).first()
    if entry is None:
        entry = ScoreboardEntry(client_id=client_id, fiscal_year=year, metric_key=body.metric_key)
        db.add(entry)
    for field in ("priority_reason", "action_item"):
        if field in body.model_fields_set:
            setattr(entry, field, (getattr(body, field) or "").strip() or None)
    db.commit()
    return {"status": "ok", "priority_reason": entry.priority_reason, "action_item": entry.action_item}


@router.put("/{client_id}/scoreboard/{year}/grade")
def set_grade(client_id: int, year: int, body: GradeOverrideRequest, db: Session = Depends(get_db)):
    entry = db.query(ScoreboardEntry).filter(
        ScoreboardEntry.client_id == client_id,
        ScoreboardEntry.fiscal_year == year,
        ScoreboardEntry.metric_key == body.metric_key,
    ).first()

    if body.grade is None:
        # Clear override — revert to auto
        if entry:
            entry.grade_is_override = False
            entry.is_top_priority = body.is_top_priority
            entry.notes = body.notes
            db.commit()
        return {"status": "ok"}

    if entry:
        entry.grade = body.grade
        entry.grade_is_override = True
        entry.is_top_priority = body.is_top_priority
        entry.notes = body.notes
    else:
        db.add(ScoreboardEntry(
            client_id=client_id,
            fiscal_year=year,
            metric_key=body.metric_key,
            grade=body.grade,
            grade_is_override=True,
            is_top_priority=body.is_top_priority,
            notes=body.notes,
        ))
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/scoreboard/{year}/recalculate")
def recalculate_grades(client_id: int, year: int, db: Session = Depends(get_db)):
    """
    Recompute all non-overridden grades and persist them to scoreboard_entries.
    This is called after new actuals are confirmed or targets are updated.
    """
    all_periods = db.query(ForecastPeriod).filter(
        ForecastPeriod.client_id == client_id,
        ForecastPeriod.fiscal_year == year,
    ).order_by(ForecastPeriod.month).all()

    actual_periods = [p for p in all_periods if p.source_type == "actual"]
    months_elapsed = len(actual_periods)

    annual_targets = _annual_targets(client_id, year, db)
    existing_entries = {
        e.metric_key: e
        for e in db.query(ScoreboardEntry).filter(
            ScoreboardEntry.client_id == client_id,
            ScoreboardEntry.fiscal_year == year,
        ).all()
    }

    for metric in SCOREBOARD_METRICS:
        key = metric["key"]
        entry = existing_entries.get(key)
        if entry and entry.grade_is_override:
            continue  # Don't touch manual overrides

        annual_target = annual_targets.get(key)
        if annual_target is None or months_elapsed == 0:
            continue

        prorated_target = int(annual_target * months_elapsed / 12)
        if prorated_target == 0:
            continue

        ytd_actual = _aggregate(actual_periods, metric)
        grade = _compute_grade(ytd_actual, prorated_target, metric["higher_is_better"])

        if entry:
            entry.grade = grade
        else:
            db.add(ScoreboardEntry(
                client_id=client_id,
                fiscal_year=year,
                metric_key=key,
                grade=grade,
                grade_is_override=False,
            ))

    db.commit()
    return {"status": "ok", "months_elapsed": months_elapsed}
