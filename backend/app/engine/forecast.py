"""
Forecast orchestrator.
Blends actuals (past months) with model projections (future months).
Pure function — no DB or FastAPI imports.
"""
from decimal import Decimal

from app.engine.revenue import calculate_revenue
from app.engine.payroll import calculate_payroll
from app.engine.owner_draws import calculate_owner_draws
from app.engine.overhead import calculate_overhead


def build_forecast_period(
    month: int,
    config: dict,
    actuals: dict | None,
) -> dict:
    """
    Build a single forecast period.

    If actuals exist for this month: source_type = "actual", copy from monthly_actuals.
    If no actuals: source_type = "forecast", run engine modules.

    Returns a full period dict including calc_trace.
    All monetary values in cents (int).
    """
    if actuals is not None:
        return _period_from_actuals(month, actuals)

    return _period_from_drivers(month, config)


def _period_from_actuals(month: int, actuals: dict) -> dict:
    """Copy actuals into forecast period format. No calculation needed."""
    revenue = actuals.get("revenue", 0)
    cos = actuals.get("cost_of_sales", 0)
    payroll = actuals.get("payroll_expenses", 0)
    marketing = actuals.get("marketing_expenses", 0)
    depreciation = actuals.get("depreciation_amortization", 0)
    overhead = actuals.get("overhead_expenses", 0)
    other = actuals.get("other_income_expense", 0)

    gross_profit = revenue - cos
    total_other_expenses = marketing + depreciation + overhead
    total_opex = payroll + total_other_expenses
    net_op = gross_profit - total_opex
    net_profit = net_op + other

    job_count = actuals.get("job_count", 0)
    blended_avg = (revenue // job_count) if job_count > 0 else 0

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
        "owner_total_draws": 0,  # not tracked in actuals yet
        "calc_trace": {
            "source": "monthly_actuals",
            "note": "Values copied directly from confirmed actuals — no engine calculation applied.",
        },
    }


def _period_from_drivers(month: int, config: dict) -> dict:
    """Run all engine modules from driver config for a forecast month."""
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
    payroll, payroll_trace = calculate_payroll(
        cost_per_run=Decimal(config.get("cost_per_pay_run", 0)),
        runs_this_month=int(config.get("pay_runs_per_month", {}).get(month_key, 0)),
        one_off=Decimal(config.get("payroll_one_off", {}).get(month_key, 0)),
    )

    # --- Owner Draws ---
    owner_draws, draws_trace = calculate_owner_draws(
        distributions=Decimal(config.get("owner_distributions", {}).get(month_key, 0)),
        tax_savings=Decimal(config.get("owner_tax_savings", {}).get(month_key, 0)),
    )

    # --- Overhead ---
    overhead, overhead_trace = calculate_overhead(
        other_overhead_cents=int(config.get("other_overhead_monthly", {}).get(month_key, 0)),
        month=month,
    )

    # --- Cost of Sales (% of revenue) ---
    cos_pct = Decimal(str(config.get("cos_pct_monthly", {}).get(month_key, 0)))
    cos = (revenue * cos_pct / Decimal(100)).quantize(Decimal("1"))
    cos_trace = {
        "value": int(cos),
        "formula": f"revenue × {cos_pct}%",
        "components": [
            {"label": f"COS % ({cos_pct}% of ${revenue / 100:,.0f})", "value": int(cos),
             "source": "forecast_driver"},
        ],
    }

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
        "owner_total_draws": int(owner_draws),
        "calc_trace": {
            "revenue": revenue_trace,
            "cost_of_sales": cos_trace,
            "payroll_expenses": payroll_trace,
            "marketing_expenses": marketing_trace,
            "depreciation_amortization": depreciation_trace,
            "owner_draws": draws_trace,
            "overhead_expenses": overhead_trace,
            "other_income_expense": other_trace,
        },
    }
