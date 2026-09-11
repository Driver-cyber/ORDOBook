from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


# ── Steps (action items under an objective) ──────────────────────────────────

class ActionPlanStepCreate(BaseModel):
    text: str = ""
    owners: List[str] = []
    due_date: Optional[date] = None
    sort_order: Optional[int] = None


class ActionPlanStepUpdate(BaseModel):
    text: Optional[str] = None
    owners: Optional[List[str]] = None
    due_date: Optional[date] = None
    sort_order: Optional[int] = None
    completed_at: Optional[datetime] = None


class ActionPlanStepOut(BaseModel):
    id: int
    item_id: int
    sort_order: int
    text: str
    owners: List[str]
    due_date: Optional[date]
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Objectives ───────────────────────────────────────────────────────────────

class ActionPlanItemCreate(BaseModel):
    objective: str = ""
    current_results: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class ActionPlanItemUpdate(BaseModel):
    objective: Optional[str] = None
    current_results: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class ActionPlanItemOut(BaseModel):
    id: int
    client_id: int
    fiscal_year: int
    sort_order: int
    objective: str
    current_results: Optional[str]
    notes: Optional[str]
    steps: List[ActionPlanStepOut] = []

    model_config = {"from_attributes": True}


class ActionPlanResponse(BaseModel):
    fiscal_year: int
    items: List[ActionPlanItemOut]
