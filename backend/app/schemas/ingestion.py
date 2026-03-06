from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class ParsedRow(BaseModel):
    account_name: str
    row_type: str
    section: str
    subsection: str
    values: dict[str, int]  # period label → cents


class MappingSuggestion(BaseModel):
    qb_account_name: str
    report_type: str  # "profit_and_loss" | "balance_sheet"
    suggested_category: str
    confidence: str  # "saved" | "high" | "low"
    needs_review: bool


class ParsePreviewResponse(BaseModel):
    client_id: int
    report_types: list[str]
    company_name: str
    periods_detected: list[str]
    rows: list[ParsedRow]
    suggestions: list[MappingSuggestion]
    job_counts: dict[str, int] = {}  # pre-populated from invoice report if uploaded


class MappingDecision(BaseModel):
    qb_account_name: str
    report_type: str  # "profit_and_loss" | "balance_sheet"
    ordobook_category: str
    is_excluded: bool = False


class PeriodValues(BaseModel):
    label: str          # e.g. "January 2026"
    fiscal_year: int
    month: int
    job_count: int = 0
    categories: dict[str, int]  # ordobook_category → cents


class ConfirmRequest(BaseModel):
    mappings: list[MappingDecision]
    periods: list[PeriodValues]
    raw_rows: list[dict[str, Any]]   # full parsed rows stored for audit trail
    source_files: list[str]
