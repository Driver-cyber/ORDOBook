from typing import Any
from pydantic import BaseModel


# ── Forecast Config (driver inputs) ──────────────────────────────────────────

class ForecastConfigCreate(BaseModel):
    fiscal_year: int

    small_job_counts: dict[str, int] = {}
    small_job_avg_value: int = 0  # cents

    medium_job_counts: dict[str, int] = {}
    medium_job_avg_value: int = 0

    large_job_counts: dict[str, int] = {}
    large_job_avg_value: int = 0

    cost_per_pay_run: int = 0
    pay_runs_per_month: dict[str, int] = {}
    payroll_one_off: dict[str, int] = {}

    owner_distributions: dict[str, int] = {}
    owner_tax_savings: dict[str, int] = {}

    overhead_schedule: list[dict[str, Any]] = []

    cos_pct_monthly: dict[str, float] = {}           # {"1": 35.5, ...}
    marketing_monthly: dict[str, int] = {}           # cents
    depreciation_monthly: dict[str, int] = {}        # cents
    other_income_expense_monthly: dict[str, int] = {}  # cents, can be negative

    notes: str | None = None


class ForecastConfigUpdate(BaseModel):
    small_job_counts: dict[str, int] | None = None
    small_job_avg_value: int | None = None

    medium_job_counts: dict[str, int] | None = None
    medium_job_avg_value: int | None = None

    large_job_counts: dict[str, int] | None = None
    large_job_avg_value: int | None = None

    cost_per_pay_run: int | None = None
    pay_runs_per_month: dict[str, int] | None = None
    payroll_one_off: dict[str, int] | None = None

    owner_distributions: dict[str, int] | None = None
    owner_tax_savings: dict[str, int] | None = None

    overhead_schedule: list[dict[str, Any]] | None = None

    cos_pct_monthly: dict[str, float] | None = None
    marketing_monthly: dict[str, int] | None = None
    depreciation_monthly: dict[str, int] | None = None
    other_income_expense_monthly: dict[str, int] | None = None

    notes: str | None = None


class ForecastConfigOut(BaseModel):
    id: int
    client_id: int
    fiscal_year: int

    small_job_counts: dict[str, Any]
    small_job_avg_value: int

    medium_job_counts: dict[str, Any]
    medium_job_avg_value: int

    large_job_counts: dict[str, Any]
    large_job_avg_value: int

    cost_per_pay_run: int
    pay_runs_per_month: dict[str, Any]
    payroll_one_off: dict[str, Any]

    owner_distributions: dict[str, Any]
    owner_tax_savings: dict[str, Any]

    overhead_schedule: list[dict[str, Any]]

    cos_pct_monthly: dict[str, Any]
    marketing_monthly: dict[str, Any]
    depreciation_monthly: dict[str, Any]
    other_income_expense_monthly: dict[str, Any]

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
    net_operating_profit: int
    other_income_expense: int
    net_profit: int

    total_job_count: int
    blended_avg_job_value: int
    owner_total_draws: int

    calc_trace: dict[str, Any]

    model_config = {"from_attributes": True}


# ── Forecast View (blended 12-month response) ─────────────────────────────────

class ForecastViewOut(BaseModel):
    config: ForecastConfigOut
    periods: list[ForecastPeriodOut]
