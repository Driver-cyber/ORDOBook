from datetime import date
from typing import Optional, List
from pydantic import BaseModel


class ActionPlanItemCreate(BaseModel):
    objective: str = ""
    current_results: Optional[str] = None
    next_steps: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    sort_order: int = 0


class ActionPlanItemUpdate(BaseModel):
    objective: Optional[str] = None
    current_results: Optional[str] = None
    next_steps: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class ActionPlanItemOut(BaseModel):
    id: int
    client_id: int
    fiscal_year: int
    sort_order: int
    objective: str
    current_results: Optional[str]
    next_steps: Optional[str]
    owner: Optional[str]
    due_date: Optional[date]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class ActionPlanResponse(BaseModel):
    fiscal_year: int
    items: List[ActionPlanItemOut]
