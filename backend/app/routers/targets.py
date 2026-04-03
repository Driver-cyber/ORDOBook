from collections import defaultdict
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.targets import ClientTarget, ScoreboardEntry
from app.models.forecast_period import ForecastPeriod
from app.models.monthly_actuals import MonthlyActuals
from app.schemas.targets import (
    TargetsUpsertRequest, TargetsResponse, TargetOut,
    ScoreboardResponse, GradeOverrideRequest,
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
    {"key": "owner_total_draws",    "label": "Owner Draws",           "type": "cents", "higher_is_better": False, "section": "Cash Flow",  "agg": "sum"},
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


def _aggregate_actuals(actuals: list) -> dict:
    """
    Aggregate MonthlyActuals records into a metric_key → int|None dict for the
    Targets page prior-year comparison column.
    Cash-flow metrics (DSO, net_cash_flow, etc.) aren't stored in raw QB actuals
    — those come from the forecast engine — so they're returned as None.
    """
    if not actuals:
        return {}
    total_jobs = sum(a.job_count or 0 for a in actuals)
    total_revenue = sum(a.revenue or 0 for a in actuals)
    total_cos = sum(a.cost_of_sales or 0 for a in actuals)
    gross_profit = total_revenue - total_cos
    total_payroll = sum(a.payroll_expenses or 0 for a in actuals)
    total_marketing = sum(a.marketing_expenses or 0 for a in actuals)
    total_overhead = sum(a.overhead_expenses or 0 for a in actuals)
    total_other_ie = sum(a.other_income_expense or 0 for a in actuals)
    total_net_profit = sum(a.net_profit_for_year or 0 for a in actuals)
    # net_op = net_profit - other_income_expense (algebraically equivalent to GP - total_expenses)
    net_op_profit = total_net_profit - total_other_ie
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
        # Cash flow metrics require the forecast engine — not in raw QB actuals
        "dso_days": None,
        "dio_days": None,
        "dpo_days": None,
        "cf_assets_change": None,
        "cf_liabilities_change": None,
        "net_cash_flow": None,
        "owner_total_draws": None,
    }


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
    """Auto-assign a grade based on actual vs prorated target."""
    if prorated_target == 0:
        return None
    ratio = actual / prorated_target  # float OK here — not financial math, just a threshold check
    if higher_is_better:
        if ratio >= 0.95:
            return "green"
        elif ratio >= 0.80:
            return "yellow"
        else:
            return "red"
    else:
        # Lower is better (expenses, DSO, DIO)
        if ratio <= 1.05:
            return "green"
        elif ratio <= 1.20:
            return "yellow"
        else:
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

    # December ending balance sheet of the prior year — basis for projected BS
    prior_dec = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == client_id,
        MonthlyActuals.fiscal_year == year - 1,
        MonthlyActuals.month == 12,
    ).first()

    prior_ending: dict = {}
    if prior_dec:
        prior_ending = {
            "cash": prior_dec.cash or 0,
            "accounts_receivable": prior_dec.accounts_receivable or 0,
            "inventory": prior_dec.inventory or 0,
            "accounts_payable": prior_dec.accounts_payable or 0,
            # Equity = retained equity + current year net income
            "equity": (prior_dec.equity_before_net_profit or 0) + (prior_dec.net_profit_for_year or 0),
        }

    # Current year forecast for comparison column
    forecast_periods = db.query(ForecastPeriod).filter(
        ForecastPeriod.client_id == client_id,
        ForecastPeriod.fiscal_year == year,
    ).all()

    return TargetsResponse(
        fiscal_year=year,
        targets=[TargetOut.model_validate(t) for t in targets],
        prior_year_actuals=_aggregate_actuals(prior_actuals),
        current_year_forecast=_aggregate_forecast_for_targets(forecast_periods),
        prior_year_ending_balances=prior_ending,
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

    # Targets and stored grades
    targets_map = {
        t.metric_key: t
        for t in db.query(ClientTarget).filter(
            ClientTarget.client_id == client_id,
            ClientTarget.fiscal_year == year,
        ).all()
    }
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

        target_obj = targets_map.get(key)
        annual_target = target_obj.target_value if target_obj else None
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

    return ScoreboardResponse(
        fiscal_year=year,
        months_elapsed=months_elapsed,
        overall_grade=overall_grade,
        red_count=red_count,
        yellow_count=yellow_count,
        green_count=green_count,
        sections=sections,
    )


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

    targets_map = {
        t.metric_key: t
        for t in db.query(ClientTarget).filter(
            ClientTarget.client_id == client_id,
            ClientTarget.fiscal_year == year,
        ).all()
    }
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

        target_obj = targets_map.get(key)
        if not target_obj or months_elapsed == 0:
            continue

        annual_target = target_obj.target_value
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
