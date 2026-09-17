from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class GenerateRequest(BaseModel):
    fiscal_year: int
    month: int
    # Which metrics earn an `exception` panel. None = every red, which is the rule
    # until the control that flags a yellow exists to set it.
    exception_keys: Optional[list[str]] = None


class PanelEdit(BaseModel):
    panel_id: str
    title: Optional[str] = None
    body: Optional[str] = None
    move_to: Optional[int] = None
    drop: bool = False


class PresentationOut(BaseModel):
    id: int
    client_id: int
    fiscal_year: int
    month: int
    version: int
    title: str
    status: str
    panels: list[dict[str, Any]]
    generated_at: Optional[datetime] = None
    presented_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PresentationSummary(BaseModel):
    id: int
    fiscal_year: int
    month: int
    version: int
    title: str
    status: str
    panel_count: int
    presented_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
