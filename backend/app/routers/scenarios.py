"""
Scenario Sandbox endpoint.
POST /api/clients/:id/scenario/calculate

Accepts annual driver inputs for 1–3 scenarios. Converts to monthly,
runs the existing forecast engine for all 12 months, and returns
full-year + quarterly aggregated outputs. No DB writes.
"""
from fastapi import APIRouter, HTTPException
from decimal import Decimal

from app.engine.forecast import build_forecast_period
from app.schemas.scenarios import (
    ScenarioCalculateRequest,
    ScenarioCalculateResponse,
    ScenarioInput,
    ScenarioResult,
)

router = APIRouter(prefix="/api/clients/{client_id}/scenario", tags=["scenarios"])


# ── Annual → Monthly conversion ───────────────────────────────────────────────

def _distribute_jobs(annual_jobs: int) -> dict[str, int]:
    """
    Distribute annual job count across 12 months as evenly as possible.
    Remainder jobs are spread across the first N months.
    e.g. 25 jobs → months 1-1 get 3 (1 remainder), months 2-12 get 2.
    """
    base = annual_jobs // 12
    remainder = annual_jobs % 12
    return {
        str(m): base + (1 if m <= remainder else 0)
        for m in range(1, 13)
    }


def _distribute_cents(annual_cents: int) -> dict[str, int]:
    """Divide annual amount evenly across 12 months (truncate; no rounding error accumulation)."""
    monthly = annual_cents // 12
    return {str(m): monthly for m in range(1, 13)}


def _build_config(scenario: ScenarioInput) -> dict:
    """
    Convert a ScenarioInput (annual drivers) into a forecast engine config dict
    compatible with build_forecast_period / _period_from_drivers.

    The engine expects per-month keys "1"–"12" for all driver dicts.
    Job counts use integer distribution; monetary values divide by 12.
    DSO/DIO/DPO are the same every month (flat).
    """
    job_counts = _distribute_jobs(scenario.total_jobs)
    # Use a single "large" job tier to represent the blended total_jobs × avg_job_value
    avg_monthly = {str(m): scenario.avg_job_value for m in range(1, 13)}

    payroll_monthly = _distribute_cents(scenario.payroll)
    marketing_monthly = _distribute_cents(scenario.marketing)
    other_monthly = _distribute_cents(scenario.other_income_expense)
    owner_dist_monthly = _distribute_cents(scenario.owner_draws)

    # COS delivered as percentage applied monthly in the engine
    cos_pct_monthly = {str(m): scenario.cos_pct for m in range(1, 13)}

    # DSO/DIO/DPO — flat across all months
    dso_monthly = {str(m): scenario.dso for m in range(1, 13)}
    dio_monthly = {str(m): scenario.dio for m in range(1, 13)}
    dpo_monthly = {str(m): scenario.dpo for m in range(1, 13)}

    # Overhead: annual amount distributed monthly, fed as other_overhead_monthly (catch-all)
    overhead_monthly = _distribute_cents(scenario.overhead)

    return {
        # Revenue: map all jobs to the "large" tier, use avg_job_value as the per-job value
        "large_job_counts": job_counts,
        "large_job_avg_value_monthly": avg_monthly,
        "small_job_counts": {str(m): 0 for m in range(1, 13)},
        "small_job_avg_value_monthly": {str(m): 0 for m in range(1, 13)},
        "medium_job_counts": {str(m): 0 for m in range(1, 13)},
        "medium_job_avg_value_monthly": {str(m): 0 for m in range(1, 13)},
        # Payroll: modelled as a single monthly cost with 1 run per month
        "cost_per_pay_run_monthly": payroll_monthly,
        "pay_runs_per_month": {str(m): 1 for m in range(1, 13)},
        "payroll_one_off": {str(m): 0 for m in range(1, 13)},
        # Owner draws (distributions only; no tax savings bucket in scenario inputs)
        "owner_distributions": owner_dist_monthly,
        "owner_tax_savings": {str(m): 0 for m in range(1, 13)},
        # Overhead (catch-all monthly; no schedule in scenarios)
        "other_overhead_monthly": overhead_monthly,
        "overhead_schedule": [],
        # P&L drivers
        "cos_pct_monthly": cos_pct_monthly,
        "marketing_monthly": marketing_monthly,
        "depreciation_monthly": {str(m): 0 for m in range(1, 13)},
        "other_income_expense_monthly": other_monthly,
        # Cash flow drivers
        "dso_monthly": dso_monthly,
        "dio_monthly": dio_monthly,
        "dpo_monthly": dpo_monthly,
        # Investing / financing — zero in scenarios (not driver inputs)
        "capex_monthly": {str(m): 0 for m in range(1, 13)},
        "other_current_assets_change_monthly": {str(m): 0 for m in range(1, 13)},
        "current_debt_change_monthly": {str(m): 0 for m in range(1, 13)},
        "long_term_debt_change_monthly": {str(m): 0 for m in range(1, 13)},
    }


# ── Aggregation helpers ───────────────────────────────────────────────────────

def _sum_field(periods: list[dict], key: str) -> int:
    return sum(p.get(key, 0) for p in periods)


def _last_field(periods: list[dict], key: str) -> int:
    """Use the last period's value for balance sheet / running-balance fields."""
    return periods[-1].get(key, 0) if periods else 0


def _avg_field(periods: list[dict], key: str) -> int:
    vals = [p.get(key, 0) for p in periods]
    return int(sum(vals) / len(vals)) if vals else 0


def _aggregate_periods(periods: list[dict]) -> dict:
    """
    Aggregate a list of monthly period dicts into a summary dict.
    Flow metrics (revenue, profit, cash flow) → sum.
    DSO/DIO/DPO → average.
    Balance sheet ending balances → last period's value.
    """
    return {
        "revenue": _sum_field(periods, "revenue"),
        "cost_of_sales": _sum_field(periods, "cost_of_sales"),
        "gross_profit": _sum_field(periods, "gross_profit"),
        "payroll_expenses": _sum_field(periods, "payroll_expenses"),
        "marketing_expenses": _sum_field(periods, "marketing_expenses"),
        "overhead_expenses": _sum_field(periods, "overhead_expenses"),
        "total_other_expenses": _sum_field(periods, "total_other_expenses"),
        "net_operating_profit": _sum_field(periods, "net_operating_profit"),
        "other_income_expense": _sum_field(periods, "other_income_expense"),
        "net_profit": _sum_field(periods, "net_profit"),
        "total_job_count": _sum_field(periods, "total_job_count"),
        "owner_total_draws": _sum_field(periods, "owner_total_draws"),
        "net_cash_flow": _sum_field(periods, "net_cash_flow"),
        # Averages
        "dso_days": _avg_field(periods, "dso_days"),
        "dio_days": _avg_field(periods, "dio_days"),
        "dpo_days": _avg_field(periods, "dpo_days"),
        # Balance sheet — ending position
        "projected_ar": _last_field(periods, "projected_ar"),
        "projected_inventory": _last_field(periods, "projected_inventory"),
        "projected_ap": _last_field(periods, "projected_ap"),
        "projected_cash": _last_field(periods, "projected_cash"),
        "projected_equity": _last_field(periods, "projected_equity"),
        # Derived blended avg
        "blended_avg_job_value": (
            _sum_field(periods, "revenue") // _sum_field(periods, "total_job_count")
            if _sum_field(periods, "total_job_count") > 0 else 0
        ),
    }


def _quarters(periods: list[dict]) -> list[dict]:
    """Split 12 monthly periods into 4 quarterly aggregations."""
    return [
        {"quarter": f"Q{q}", **_aggregate_periods(periods[(q - 1) * 3 : q * 3])}
        for q in range(1, 5)
    ]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/calculate", response_model=ScenarioCalculateResponse)
def calculate_scenarios(client_id: int, payload: ScenarioCalculateRequest):
    if not 1 <= len(payload.scenarios) <= 3:
        raise HTTPException(status_code=422, detail="Provide 1 to 3 scenarios.")

    results: list[ScenarioResult] = []

    for scenario in payload.scenarios:
        config = _build_config(scenario)
        monthly_periods: list[dict] = []
        prior_projected: dict | None = None

        for month in range(1, 13):
            period = build_forecast_period(
                month=month,
                config=config,
                actuals=None,          # scenarios are always pure forecast
                prior_projected=prior_projected,
            )
            monthly_periods.append(period)
            prior_projected = period   # pass forward for balance sheet chain

        results.append(ScenarioResult(
            name=scenario.name,
            full_year=_aggregate_periods(monthly_periods),
            quarters=_quarters(monthly_periods),
        ))

    return ScenarioCalculateResponse(
        fiscal_year=payload.fiscal_year,
        scenarios=results,
    )
