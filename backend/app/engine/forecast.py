"""
Forecast orchestrator.
Blends actuals (past months) with model projections (future months).
Pure function — no DB or FastAPI imports.
"""
from decimal import Decimal

from app.engine.revenue import calculate_revenue
from app.engine.payroll import calculate_payroll
from app.engine.overhead import calculate_overhead


def calculate_cost_of_sales(config: dict, month_key: str, revenue: Decimal) -> tuple[Decimal, dict]:
    """Cost of Sales for one month.

    A month with a fixed dollar entry (cos_fixed_monthly, cents) is pinned to it
    and does not move with revenue. Otherwise COS is cos_pct_monthly % of
    revenue. Both inputs are drivers; the trace says which applied.
    """
    fixed = config.get("cos_fixed_monthly", {}).get(month_key)
    if fixed is not None:
        cos = Decimal(int(fixed))
        return cos, {
            "value": int(cos),
            "formula": "fixed $ entry",
            "components": [
                {"label": "COS (fixed $ entry, pinned)", "value": int(cos), "source": "forecast_driver"},
            ],
        }
    cos_pct = Decimal(str(config.get("cos_pct_monthly", {}).get(month_key, 0)))
    cos = (revenue * cos_pct / Decimal(100)).quantize(Decimal("1"))
    return cos, {
        "value": int(cos),
        "formula": f"revenue × {cos_pct}%",
        "components": [
            {"label": f"COS % ({cos_pct}% of ${revenue / 100:,.0f})", "value": int(cos),
             "source": "forecast_driver"},
        ],
    }


def build_forecast_period(
    month: int,
    config: dict,
    actuals: dict | None,
    prior_projected: dict | None = None,
) -> dict:
    """
    Build a single forecast period.

    If actuals exist for this month: source_type = "actual", copy from monthly_actuals.
    If no actuals: source_type = "forecast", run engine modules.

    prior_projected: the previous period's projected balance sheet values, used to
    compute month-over-month deltas and forward balance sheet projections.
    Keys: projected_ar, projected_inventory, projected_ap,
          projected_other_current_assets, projected_current_debt, projected_long_term_debt,
          projected_cash, projected_fixed_assets, projected_other_lt_assets

    Returns a full period dict including calc_trace.
    All monetary values in cents (int).
    """
    if actuals is not None:
        return _period_from_actuals(month, actuals, prior_projected)

    return _period_from_drivers(month, config, prior_projected)


def _period_from_actuals(month: int, actuals: dict, prior_projected: dict | None = None) -> dict:
    """Copy actuals into forecast period format. No calculation needed."""
    prior = prior_projected or {}

    revenue = actuals.get("revenue", 0)
    cos = actuals.get("cost_of_sales", 0)
    payroll = actuals.get("payroll_expenses", 0)
    marketing = actuals.get("marketing_expenses", 0)
    depreciation = actuals.get("depreciation_amortization", 0)
    overhead = actuals.get("overhead_expenses", 0)
    other = actuals.get("other_income_expense", 0)

    gross_profit = revenue - cos

    # Use QB's authoritative Total Expenses for net_op — this captures all expense
    # accounts including any that were excluded or unmapped during import.
    # Recalculating from components alone can miss expenses, producing a wrong net_op.
    total_expenses_qb = actuals.get("total_expenses", 0)
    if total_expenses_qb > 0:
        net_op = gross_profit - total_expenses_qb
        # total_other_expenses = everything except payroll, for display breakdown
        total_other_expenses = max(0, total_expenses_qb - payroll)
    else:
        # Legacy fallback for records that predate total_expenses storage
        total_other_expenses = marketing + depreciation + overhead
        net_op = gross_profit - (payroll + total_other_expenses)

    net_profit = net_op + other

    job_count = actuals.get("job_count", 0)
    blended_avg = (revenue // job_count) if job_count > 0 else 0

    # Balance sheet values from actuals
    ar = actuals.get("accounts_receivable", 0)
    inventory_val = actuals.get("inventory", 0)
    ap = actuals.get("accounts_payable", 0)
    other_ca = actuals.get("other_current_assets", 0)
    current_debt = actuals.get("other_current_liabilities", 0)
    lt_debt = actuals.get("total_long_term_liabilities", 0)

    # DSO/DIO/DPO from balance sheet
    dso_days = int(round(ar / revenue * 30)) if revenue > 0 else 0
    dio_days = int(round(inventory_val / cos * 30)) if cos > 0 else 0
    dpo_days = int(round(ap / cos * 30)) if cos > 0 else 0

    # Month-over-month deltas vs prior period
    ar_change = ar - prior.get("projected_ar", 0)
    inventory_change = inventory_val - prior.get("projected_inventory", 0)
    ap_change = ap - prior.get("projected_ap", 0)
    other_ca_change = other_ca - prior.get("projected_other_current_assets", 0)
    curr_debt_change = current_debt - prior.get("projected_current_debt", 0)
    lt_debt_change = lt_debt - prior.get("projected_long_term_debt", 0)

    # CapEx from the balance sheet, as SIGNED CASH: fixed assets are carried net
    # of accumulated depreciation, so purchases = Δ net fixed assets + this
    # month's depreciation, and a purchase uses cash → negative. A disposal reads
    # positive. Needs last month's balance — without one (first month, no prior
    # December) it stays 0.
    fixed_assets = actuals.get("total_fixed_assets", 0)
    prior_fixed = prior.get("projected_fixed_assets")
    capex = -(fixed_assets - prior_fixed + depreciation) if prior_fixed is not None else 0

    # Other current assets as signed cash: the balance growing uses cash.
    other_ca_change = -other_ca_change

    # Owner activity. The actuals column holds QB's signed YTD equity balance for
    # draws / distributions / contributions (draws negative), which resets each
    # fiscal year. This month's activity is the change in that balance; January
    # measures against 0. Already signed cash: a draw is negative, an investment
    # positive — the same convention the forecast branch stores.
    owner_balance = actuals.get("owner_distributions", 0) or 0
    prior_owner_balance = prior.get("owner_distributions_balance", 0) or 0
    distributions = owner_balance - prior_owner_balance   # signed cash, draws negative

    # Full cash flow: net profit plus every signed cash line
    net_cash = (
        net_profit
        + distributions
        - ar_change
        - inventory_change
        + ap_change
        + capex
        + other_ca_change
        + curr_debt_change
        + lt_debt_change
    )

    # --- Phase 3d: balance sheet totals from actuals ---
    cash = actuals.get("cash", 0)
    other_lt_assets = actuals.get("total_other_long_term_assets", 0)

    total_ca = cash + ar + inventory_val + other_ca
    total_assets = total_ca + fixed_assets + other_lt_assets
    total_cl = ap + current_debt
    total_liabilities = total_cl + lt_debt
    equity = total_assets - total_liabilities

    return {
        "month": month,
        "source_type": "actual",
        "revenue": revenue,
        "cost_of_sales": cos,
        "gross_profit": gross_profit,
        "payroll_expenses": payroll,
        "marketing_expenses": marketing,
        "depreciation_amortization": depreciation,
        "overhead_expenses": overhead,
        "total_other_expenses": total_other_expenses,
        "net_operating_profit": net_op,
        "other_income_expense": other,
        "net_profit": net_profit,
        "total_job_count": job_count,
        "blended_avg_job_value": blended_avg,
        "owner_total_draws": distributions,
        "projected_ar": ar,
        "projected_inventory": inventory_val,
        "projected_ap": ap,
        "owner_distributions": distributions,
        "net_cash_flow": net_cash,
        "dso_days": dso_days,
        "dio_days": dio_days,
        "dpo_days": dpo_days,
        "ar_change": ar_change,
        "inventory_change": inventory_change,
        "ap_change": ap_change,
        "capex": capex,
        "other_current_assets_change": other_ca_change,
        "current_debt_change": curr_debt_change,
        "long_term_debt_change": lt_debt_change,
        "projected_other_current_assets": other_ca,
        "projected_current_debt": current_debt,
        "projected_long_term_debt": lt_debt,
        # Phase 3d
        "projected_cash": cash,
        "projected_fixed_assets": fixed_assets,
        "projected_other_lt_assets": other_lt_assets,
        "projected_total_current_assets": total_ca,
        "projected_total_assets": total_assets,
        "projected_total_current_liabilities": total_cl,
        "projected_total_liabilities": total_liabilities,
        "projected_equity": equity,
        "calc_trace": {
            "source": "monthly_actuals",
            "note": "Values copied directly from confirmed actuals — balance-sheet deltas and owner activity derived from them.",
            "owner_draws": {
                "value": distributions,
                "formula": "owner_distributions balance - prior month balance (signed cash)",
                "components": [
                    {"label": "Owner activity balance (YTD, signed)", "value": owner_balance, "source": "actual"},
                    {"label": "Prior month balance", "value": prior_owner_balance, "source": "actual"},
                ],
            },
            "capex": {
                "value": capex,
                "formula": "-(net fixed assets - prior month net fixed assets + depreciation)  (signed cash)",
                "components": [
                    {"label": "Net fixed assets", "value": fixed_assets, "source": "actual"},
                    {"label": "Prior month net fixed assets", "value": prior_fixed, "source": "actual"},
                    {"label": "Depreciation & amortization", "value": depreciation, "source": "actual"},
                ],
            },
        },
    }


def _period_from_drivers(month: int, config: dict, prior_projected: dict | None = None) -> dict:
    """Run all engine modules from driver config for a forecast month."""
    prior = prior_projected or {}
    month_key = str(month)

    # --- Revenue ---
    # Per-month avg values take precedence; fall back to legacy scalar if not set
    def _avg(monthly_field, scalar_field):
        monthly = config.get(monthly_field, {}).get(month_key)
        if monthly is not None and monthly != 0:
            return Decimal(monthly)
        return Decimal(config.get(scalar_field, 0))

    revenue, revenue_trace = calculate_revenue(
        small_count=int(config.get("small_job_counts", {}).get(month_key, 0)),
        small_avg=_avg("small_job_avg_value_monthly", "small_job_avg_value"),
        medium_count=int(config.get("medium_job_counts", {}).get(month_key, 0)),
        medium_avg=_avg("medium_job_avg_value_monthly", "medium_job_avg_value"),
        large_count=int(config.get("large_job_counts", {}).get(month_key, 0)),
        large_avg=_avg("large_job_avg_value_monthly", "large_job_avg_value"),
    )

    total_jobs = (
        int(config.get("small_job_counts", {}).get(month_key, 0))
        + int(config.get("medium_job_counts", {}).get(month_key, 0))
        + int(config.get("large_job_counts", {}).get(month_key, 0))
    )
    blended_avg = int(revenue // total_jobs) if total_jobs > 0 else 0

    # --- Payroll ---
    # Per-month cost_per_pay_run takes precedence; fall back to legacy scalar
    monthly_cost = config.get("cost_per_pay_run_monthly", {}).get(month_key)
    cost_per_run = Decimal(monthly_cost) if (monthly_cost is not None and monthly_cost != 0) \
        else Decimal(config.get("cost_per_pay_run", 0))

    payroll, payroll_trace = calculate_payroll(
        cost_per_run=cost_per_run,
        runs_this_month=int(config.get("pay_runs_per_month", {}).get(month_key, 0)),
        one_off=Decimal(config.get("payroll_one_off", {}).get(month_key, 0)),
    )

    # --- Overhead ---
    # Presence, not truthiness: a month keyed in other_overhead_monthly is hard
    # keyed and overrides its schedule; a month absent falls through to the sum.
    _oh_monthly = config.get("other_overhead_monthly") or {}
    _oh_hard = int(_oh_monthly[month_key]) if month_key in _oh_monthly else None
    overhead, overhead_trace = calculate_overhead(
        hard_key_cents=_oh_hard,
        detail=(config.get("overhead_detail_monthly") or {}).get(month_key) or {},
    )

    # --- Cost of Sales ---
    cos, cos_trace = calculate_cost_of_sales(config, month_key, revenue)

    # --- Marketing ---
    marketing = Decimal(config.get("marketing_monthly", {}).get(month_key, 0))
    marketing_trace = {
        "value": int(marketing),
        "formula": "manual entry",
        "components": [{"label": "Marketing / Advertising", "value": int(marketing),
                         "source": "forecast_driver"}],
    }

    # --- Depreciation ---
    depreciation = Decimal(config.get("depreciation_monthly", {}).get(month_key, 0))
    depreciation_trace = {
        "value": int(depreciation),
        "formula": "manual entry",
        "components": [{"label": "Depreciation & Amortization", "value": int(depreciation),
                         "source": "forecast_driver"}],
    }

    # --- Other Income / Expense ---
    other = Decimal(config.get("other_income_expense_monthly", {}).get(month_key, 0))
    other_trace = {
        "value": int(other),
        "formula": "manual entry",
        "components": [{"label": "Other Income / Expense", "value": int(other),
                         "source": "forecast_driver"}],
    }

    # --- Derived P&L ---
    gross_profit = revenue - cos
    total_other_expenses = marketing + depreciation + overhead
    total_opex = payroll + total_other_expenses
    net_op = gross_profit - total_opex
    net_profit = net_op + other

    # --- Cash flow drivers ---
    dso = int(config.get("dso_monthly", {}).get(month_key, 0))
    dio = int(config.get("dio_monthly", {}).get(month_key, 0))
    dpo = int(config.get("dpo_monthly", {}).get(month_key, 0))

    # Every cash-flow driver is SIGNED CASH (migration 029): positive adds cash,
    # negative uses it. A draw, a purchase, a growing other-current-asset balance
    # and a debt repayment are all negative; an owner investment, a disposal, a
    # shrinking OCA balance and new borrowing are positive. The section then sums
    # straight down from net profit to net cash flow.
    # Owner activity, already signed cash: a draw is negative, an investment
    # positive. The tax reserve was folded in by migration 023.
    distributions = Decimal(config.get("owner_distributions", {}).get(month_key, 0))
    draws_trace = {
        "value": int(distributions),
        "formula": "manual entry",
        "components": [{"label": "Investments or (Draws) by Owner",
                        "value": int(distributions), "source": "forecast_driver"}],
    }

    projected_ar = int(revenue * dso / 30) if dso > 0 else 0
    projected_inventory_val = int(cos * dio / 30) if dio > 0 else 0
    projected_ap = int(cos * dpo / 30) if dpo > 0 else 0

    # --- Investing & financing drivers ---
    capex = int(config.get("capex_monthly", {}).get(month_key, 0))
    other_ca_change = int(config.get("other_current_assets_change_monthly", {}).get(month_key, 0))
    curr_debt_change = int(config.get("current_debt_change_monthly", {}).get(month_key, 0))
    lt_debt_change = int(config.get("long_term_debt_change_monthly", {}).get(month_key, 0))

    # Running balance projections (a negative cash change means the asset grew)
    proj_other_ca = prior.get("projected_other_current_assets", 0) - other_ca_change
    proj_curr_debt = prior.get("projected_current_debt", 0) + curr_debt_change
    proj_lt_debt = prior.get("projected_long_term_debt", 0) + lt_debt_change

    # Month-over-month WC deltas
    ar_change = projected_ar - prior.get("projected_ar", 0)
    inventory_change = projected_inventory_val - prior.get("projected_inventory", 0)
    ap_change = projected_ap - prior.get("projected_ap", 0)

    # Full cash flow: net profit, then every signed cash line added. ar/inventory/
    # ap_change are BALANCE deltas (the quantities the balance sheet needs), so
    # their cash effect is applied here: an asset growing uses cash, a liability
    # growing frees it.
    net_cash = int(
        net_profit
        + distributions
        - ar_change
        - inventory_change
        + ap_change
        + capex
        + other_ca_change
        + curr_debt_change
        + lt_debt_change
    )

    # --- Phase 3d: forward balance sheet projections ---
    proj_cash = prior.get("projected_cash", 0) + net_cash
    proj_fixed = max(0, prior.get("projected_fixed_assets", 0) - int(depreciation) - capex)
    proj_other_lt = prior.get("projected_other_lt_assets", 0)  # flat — no driver yet

    proj_total_ca = proj_cash + projected_ar + projected_inventory_val + proj_other_ca
    proj_total_assets = proj_total_ca + proj_fixed + proj_other_lt
    proj_total_cl = projected_ap + proj_curr_debt
    proj_total_liabilities = proj_total_cl + proj_lt_debt
    proj_equity = proj_total_assets - proj_total_liabilities

    return {
        "month": month,
        "source_type": "forecast",
        "revenue": int(revenue),
        "cost_of_sales": int(cos),
        "gross_profit": int(gross_profit),
        "payroll_expenses": int(payroll),
        "marketing_expenses": int(marketing),
        "depreciation_amortization": int(depreciation),
        "overhead_expenses": int(overhead),
        "total_other_expenses": int(total_other_expenses),
        "net_operating_profit": int(net_op),
        "other_income_expense": int(other),
        "net_profit": int(net_profit),
        "total_job_count": total_jobs,
        "blended_avg_job_value": blended_avg,
        "owner_total_draws": int(distributions),
        "projected_ar": projected_ar,
        "projected_inventory": projected_inventory_val,
        "projected_ap": projected_ap,
        "owner_distributions": int(distributions),
        "net_cash_flow": net_cash,
        "dso_days": dso,
        "dio_days": dio,
        "dpo_days": dpo,
        "ar_change": ar_change,
        "inventory_change": inventory_change,
        "ap_change": ap_change,
        "capex": capex,
        "other_current_assets_change": other_ca_change,
        "current_debt_change": curr_debt_change,
        "long_term_debt_change": lt_debt_change,
        "projected_other_current_assets": proj_other_ca,
        "projected_current_debt": proj_curr_debt,
        "projected_long_term_debt": proj_lt_debt,
        # Phase 3d
        "projected_cash": proj_cash,
        "projected_fixed_assets": proj_fixed,
        "projected_other_lt_assets": proj_other_lt,
        "projected_total_current_assets": proj_total_ca,
        "projected_total_assets": proj_total_assets,
        "projected_total_current_liabilities": proj_total_cl,
        "projected_total_liabilities": proj_total_liabilities,
        "projected_equity": proj_equity,
        "calc_trace": {
            "revenue": revenue_trace,
            "cost_of_sales": cos_trace,
            "payroll_expenses": payroll_trace,
            "marketing_expenses": marketing_trace,
            "depreciation_amortization": depreciation_trace,
            "owner_draws": draws_trace,
            "overhead_expenses": overhead_trace,
            "other_income_expense": other_trace,
            "cash_flow": {
                "dso": dso, "dio": dio, "dpo": dpo,
                "projected_ar": projected_ar,
                "projected_ap": projected_ap,
                "net_cash": net_cash,
            },
        },
    }
