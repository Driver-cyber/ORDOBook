from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class ActualsListItem(BaseModel):
    id: int
    client_id: int
    fiscal_year: int
    month: int
    status: str
    revenue: int
    cost_of_sales: int
    payroll_expenses: int
    overhead_expenses: int
    job_count: int
    uploaded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ActualsDetail(BaseModel):
    id: int
    client_id: int
    fiscal_year: int
    month: int
    status: str

    # Income Statement
    revenue: int
    cost_of_sales: int
    payroll_expenses: int
    marketing_expenses: int
    depreciation_amortization: int
    overhead_expenses: int
    other_income_expense: int

    # Balance Sheet
    cash: int
    accounts_receivable: int
    inventory: int
    other_current_assets: int
    total_fixed_assets: int
    total_other_long_term_assets: int
    accounts_payable: int
    other_current_liabilities: int
    total_long_term_liabilities: int
    equity_before_net_profit: int
    net_profit_for_year: int

    job_count: int
    source_files: list[str]
    uploaded_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ActualsUpdate(BaseModel):
    job_count: Optional[int] = None
    status: Optional[str] = None
