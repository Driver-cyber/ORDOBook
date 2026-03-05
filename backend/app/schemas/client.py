from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    industry: Optional[str] = None
    fiscal_year_start_month: int = Field(default=1, ge=1, le=12)
    timezone: str = "America/Chicago"
    terminology_config: dict[str, Any] = Field(default_factory=dict)
    advisor_notes: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    industry: Optional[str] = None
    fiscal_year_start_month: Optional[int] = Field(default=None, ge=1, le=12)
    timezone: Optional[str] = None
    terminology_config: Optional[dict[str, Any]] = None
    advisor_notes: Optional[str] = None


class ClientResponse(ClientBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
