from typing import Any
from pydantic import BaseModel


# ── Forecast Config (driver inputs) ──────────────────────────────────────────

class ForecastConfigCreate(BaseModel):
    fiscal_year: int

    small_job_counts: dict[str, int] = {}
    small_job_avg_value: int = 0                        # legacy scalar (kept for compat)
    small_job_avg_value_monthly: dict[str, int] = {}    # per-month cents

    medium_job_counts: dict[str, int] = {}
    medium_job_avg_value: int = 0
    medium_job_avg_value_monthly: dict[str, int] = {}

    large_job_counts: dict[str, int] = {}
    large_job_avg_value: int = 0
    large_job_avg_value_monthly: dict[str, int] = {}

    cost_per_pay_run: int = 0
    cost_per_pay_run_monthly: dict[str, int] = {}
    pay_runs_per_month: dict[str, int] = {}
    payroll_one_off: dict[str, int] = {}

    owner_distributions: dict[str, int] = {}
    owner_tax_savings: dict[str, int] = {}

    overhead_schedule: list[dict[str, Any]] = []
    other_overhead_monthly: dict[str, int] = {}         # catch-all overhead per month (cents)

    cos_pct_monthly: dict[str, float] = {}
    marketing_monthly: dict[str, int] = {}
    depreciation_monthly: dict[str, int] = {}
    other_income_expense_monthly: dict[str, int] = {}

    dso_monthly: dict = {}
    dio_monthly: dict = {}
    dpo_monthly: dict = {}

    capex_monthly: dict[str, int] = {}
    other_current_assets_change_monthly: dict[str, int] = {}
    current_debt_change_monthly: dict[str, int] = {}
    long_term_debt_change_monthly: dict[str, int] = {}

    notes: str | None = None


class ForecastConfigUpdate(BaseModel):
    small_job_counts: dict[str, int] | None = None
    small_job_avg_value: int | None = None
    small_job_avg_value_monthly: dict[str, int] | None = None

    medium_job_counts: dict[str, int] | None = None
    medium_job_avg_value: int | None = None
    medium_job_avg_value_monthly: dict[str, int] | None = None

    large_job_counts: dict[str, int] | None = None
    large_job_avg_value: int | None = None
    large_job_avg_value_monthly: dict[str, int] | None = None

    cost_per_pay_run: int | None = None
    cost_per_pay_run_monthly: dict[str, int] | None = None
    pay_runs_per_month: dict[str, int] | None = None
    payroll_one_off: dict[str, int] | None = None

    owner_distributions: dict[str, int] | None = None
    owner_tax_savings: dict[str, int] | None = None

    overhead_schedule: list[dict[str, Any]] | None = None
    other_overhead_monthly: dict[str, int] | None = None

    cos_pct_monthly: dict[str, float] | None = None
    marketing_monthly: dict[str, int] | None = None
    depreciation_monthly: dict[str, int] | None = None
    other_income_expense_monthly: dict[str, int] | None = None

    dso_monthly: dict | None = None
    dio_monthly: dict | None = None
    dpo_monthly: dict | None = None

    capex_monthly: dict[str, int] | None = None
    other_current_assets_change_monthly: dict[str, int] | None = None
    current_debt_change_monthly: dict[str, int] | None = None
    long_term_debt_change_monthly: dict[str, int] | None = None

    notes: str | None = None


class ForecastConfigOut(BaseModel):
    id: int
    client_id: int
    fiscal_year: int

    small_job_counts: dict[str, Any]
    small_job_avg_value: int
    small_job_avg_value_monthly: dict[str, Any]

    medium_job_counts: dict[str, Any]
    medium_job_avg_value: int
    medium_job_avg_value_monthly: dict[str, Any]

    large_job_counts: dict[str, Any]
    large_job_avg_value: int
    large_job_avg_value_monthly: dict[str, Any]

    cost_per_pay_run: int
    cost_per_pay_run_monthly: dict[str, Any]
    pay_runs_per_month: dict[str, Any]
    payroll_one_off: dict[str, Any]

    owner_distributions: dict[str, Any]
    owner_tax_savings: dict[str, Any]

    overhead_schedule: list[dict[str, Any]]
    other_overhead_monthly: dict[str, Any]

    cos_pct_monthly: dict[str, Any]
    marketing_monthly: dict[str, Any]
    depreciation_monthly: dict[str, Any]
    other_income_expense_monthly: dict[str, Any]

    dso_monthly: dict[str, Any]
    dio_monthly: dict[str, Any]
    dpo_monthly: dict[str, Any]

    capex_monthly: dict[str, Any]
    other_current_assets_change_monthly: dict[str, Any]
    current_debt_change_monthly: dict[str, Any]
    long_term_debt_change_monthly: dict[str, Any]

    notes: str | None

    model_config = {"from_attributes": True}


# ── Forecast Period (calculated outputs) ─────────────────────────────────────

class ForecastPeriodOut(BaseModel):
    id: int
    client_id: int
    config_id: int
    fiscal_year: int
    month: int
    source_type: str

    revenue: int
    cost_of_sales: int
    gross_profit: int
    payroll_expenses: int
    marketing_expenses: int
    depreciation_amortization: int
    overhead_expenses: int
    total_other_expenses: int
    net_operating_profit: int
    other_income_expense: int
    net_profit: int

    total_job_count: int
    blended_avg_job_value: int
    owner_total_draws: int

    projected_ar: int = 0
    projected_inventory: int = 0
    projected_ap: int = 0
    owner_distributions: int = 0
    owner_tax_savings: int = 0
    net_cash_flow: int = 0
    dso_days: int = 0
    dio_days: int = 0
    dpo_days: int = 0

    ar_change: int = 0
    inventory_change: int = 0
    ap_change: int = 0
    capex: int = 0
    other_current_assets_change: int = 0
    current_debt_change: int = 0
    long_term_debt_change: int = 0
    projected_other_current_assets: int = 0
    projected_current_debt: int = 0
    projected_long_term_debt: int = 0

    # Phase 3d
    projected_cash: int = 0
    projected_fixed_assets: int = 0
    projected_other_lt_assets: int = 0
    projected_total_current_assets: int = 0
    projected_total_assets: int = 0
    projected_total_current_liabilities: int = 0
    projected_total_liabilities: int = 0
    projected_equity: int = 0

    calc_trace: dict[str, Any]

    model_config = {"from_attributes": True}


# ── Forecast View (blended 12-month response) ─────────────────────────────────

class ForecastViewOut(BaseModel):
    config: ForecastConfigOut
    periods: list[ForecastPeriodOut]
