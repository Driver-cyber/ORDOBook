from typing import Optional, List, Dict
from pydantic import BaseModel


class TargetItem(BaseModel):
    metric_key: str
    target_value: int
    target_type: str  # "cents" | "count" | "days"


class TargetsUpsertRequest(BaseModel):
    targets: List[TargetItem]


class TargetOut(BaseModel):
    metric_key: str
    target_value: int
    target_type: str

    class Config:
        from_attributes = True


class TargetsResponse(BaseModel):
    fiscal_year: int
    targets: List[TargetOut]
    prior_year_actuals: Dict[str, Optional[int]] = {}
    current_year_forecast: Dict[str, Optional[int]] = {}
    # December ending balance sheet from the prior fiscal year — used to compute
    # projected cash/AR/AP/equity and the cash flow impact of working capital changes
    prior_year_ending_balances: Dict[str, Optional[int]] = {}


class GradeOverrideRequest(BaseModel):
    metric_key: str
    grade: Optional[str] = None   # None = clear override, revert to auto
    is_top_priority: bool = False
    notes: Optional[str] = None


class ScoreboardMetricOut(BaseModel):
    key: str
    label: str
    type: str           # "cents" | "count" | "days"
    higher_is_better: bool
    prior_year_total: Optional[int]
    ytd_actual: int
    full_year_forecast: int
    annual_target: Optional[int]
    prorated_target: Optional[int]
    variance_pct: Optional[float]   # positive = favorable vs prorated target (regardless of direction)
    variance_abs: Optional[int]     # absolute difference vs prorated target
    grade: Optional[str]            # "green" | "yellow" | "red" | None (no target set)
    grade_is_override: bool
    is_top_priority: bool
    notes: Optional[str]
    has_target: bool


class ScoreboardSectionOut(BaseModel):
    name: str
    metrics: List[ScoreboardMetricOut]


class ScoreboardResponse(BaseModel):
    fiscal_year: int
    months_elapsed: int
    overall_grade: Optional[str]
    red_count: int
    yellow_count: int
    green_count: int
    sections: List[ScoreboardSectionOut]
