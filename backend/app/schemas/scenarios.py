from pydantic import BaseModel


class ScenarioInput(BaseModel):
    name: str
    total_jobs: int = 0
    avg_job_value: int = 0          # annual cents per job
    cos_pct: float = 0.0            # percentage (e.g. 35.0 = 35%)
    payroll: int = 0                # annual cents
    marketing: int = 0             # annual cents
    overhead: int = 0              # annual cents
    other_income_expense: int = 0  # annual cents, signed (+income / -expense)
    owner_draws: int = 0           # annual cents
    dso: int = 0                   # days
    dio: int = 0                   # days
    dpo: int = 0                   # days


class ScenarioCalculateRequest(BaseModel):
    scenarios: list[ScenarioInput]  # 1–3 scenarios
    fiscal_year: int


class ScenarioResult(BaseModel):
    name: str
    full_year: dict
    quarters: list[dict]


class ScenarioCalculateResponse(BaseModel):
    fiscal_year: int
    scenarios: list[ScenarioResult]
