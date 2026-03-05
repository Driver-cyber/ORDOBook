from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class MonthlyActuals(Base):
    __tablename__ = "monthly_actuals"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1–12
    status = Column(String(50), nullable=False, default="draft")

    # Income Statement (cents)
    revenue = Column(BigInteger, nullable=False, default=0)
    cost_of_sales = Column(BigInteger, nullable=False, default=0)
    payroll_expenses = Column(BigInteger, nullable=False, default=0)
    marketing_expenses = Column(BigInteger, nullable=False, default=0)
    depreciation_amortization = Column(BigInteger, nullable=False, default=0)
    overhead_expenses = Column(BigInteger, nullable=False, default=0)
    other_income_expense = Column(BigInteger, nullable=False, default=0)

    # Balance Sheet (cents)
    cash = Column(BigInteger, nullable=False, default=0)
    accounts_receivable = Column(BigInteger, nullable=False, default=0)
    inventory = Column(BigInteger, nullable=False, default=0)
    other_current_assets = Column(BigInteger, nullable=False, default=0)
    total_fixed_assets = Column(BigInteger, nullable=False, default=0)
    total_other_long_term_assets = Column(BigInteger, nullable=False, default=0)
    accounts_payable = Column(BigInteger, nullable=False, default=0)
    other_current_liabilities = Column(BigInteger, nullable=False, default=0)
    total_long_term_liabilities = Column(BigInteger, nullable=False, default=0)
    equity_before_net_profit = Column(BigInteger, nullable=False, default=0)
    net_profit_for_year = Column(BigInteger, nullable=False, default=0)

    # Manually entered
    job_count = Column(Integer, nullable=False, default=0)

    # Audit trail
    raw_data = Column(JSONB, nullable=False, default=dict)
    source_files = Column(JSONB, nullable=False, default=list)
    uploaded_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", "month", name="uq_monthly_actuals_period"),
    )
