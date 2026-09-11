from typing import Optional, List, Dict
from pydantic import BaseModel


class TargetItem(BaseModel):
    metric_key: str
    target_value: int
    target_type: str  # "cents" | "count" | "days"


class TargetsUpsertRequest(BaseModel):
    targets: List[TargetItem]


class TargetNoteUpdate(BaseModel):
    """Update just the advisor note on one metric, leaving target values alone."""
    metric_key: str
    notes: Optional[str] = None


class TargetOut(BaseModel):
    metric_key: str
    target_value: int
    target_type: str
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class TargetsResponse(BaseModel):
    fiscal_year: int
    targets: List[TargetOut]
    prior_year_actuals: Dict[str, Optional[int]] = {}
    current_year_forecast: Dict[str, Optional[int]] = {}
    # December ending balance sheet from the prior fiscal year — used to compute
    # projected cash/AR/AP/equity and the cash flow impact of working capital changes
    prior_year_ending_balances: Dict[str, Optional[int]] = {}
    # Every computed value the Targets page shows, derived server-side from the
    # stored drivers (app.engine.targets). Never persisted.
    derived: Dict[str, Optional[int]] = {}


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
    # Advisor-written client-facing text (None = auto wording is used)
    priority_reason: Optional[str] = None
    action_item: Optional[str] = None


class MetricTextUpdate(BaseModel):
    """Set or clear the client-facing wording for one metric. A field left unset
    is untouched; an empty string clears it back to the auto wording."""
    metric_key: str
    priority_reason: Optional[str] = None
    action_item: Optional[str] = None


class ScoreboardTextUpdate(BaseModel):
    headline: Optional[str] = None   # empty string clears back to auto


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
    headline: Optional[str] = None   # advisor override; None = auto
