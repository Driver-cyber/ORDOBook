from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class ForecastPeriod(Base):
    __tablename__ = "forecast_periods"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    config_id = Column(Integer, ForeignKey("forecast_configs.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)  # 1–12

    # "actual" | "forecast" | "manual_override"
    source_type = Column(String(20), nullable=False, default="forecast")

    # Financial outputs — all in cents
    revenue = Column(BigInteger, nullable=False, default=0)
    cost_of_sales = Column(BigInteger, nullable=False, default=0)
    gross_profit = Column(BigInteger, nullable=False, default=0)           # calculated, stored for trace
    payroll_expenses = Column(BigInteger, nullable=False, default=0)
    marketing_expenses = Column(BigInteger, nullable=False, default=0)
    depreciation_amortization = Column(BigInteger, nullable=False, default=0)
    overhead_expenses = Column(BigInteger, nullable=False, default=0)
    total_other_expenses = Column(BigInteger, nullable=False, default=0)   # marketing + depreciation + overhead
    net_operating_profit = Column(BigInteger, nullable=False, default=0)   # calculated, stored
    other_income_expense = Column(BigInteger, nullable=False, default=0)
    net_profit = Column(BigInteger, nullable=False, default=0)             # calculated, stored

    # Derived operational metrics
    total_job_count = Column(Integer, nullable=False, default=0)           # sum of all tiers
    blended_avg_job_value = Column(BigInteger, nullable=False, default=0)  # revenue / total_jobs
    owner_total_draws = Column(BigInteger, nullable=False, default=0)      # distributions + tax_savings

    # Cash flow outputs — Phase 3c
    projected_ar = Column(BigInteger, nullable=False, default=0)           # AR balance (cents)
    projected_inventory = Column(BigInteger, nullable=False, default=0)    # Inventory balance (cents)
    projected_ap = Column(BigInteger, nullable=False, default=0)           # AP balance (cents)
    owner_distributions = Column(BigInteger, nullable=False, default=0)    # cash out to owner (cents)
    owner_tax_savings = Column(BigInteger, nullable=False, default=0)      # tax reserve (cents)
    net_cash_flow = Column(BigInteger, nullable=False, default=0)          # net profit − owner draws (cents)
    dso_days = Column(Integer, nullable=False, default=0)                  # days sales outstanding
    dio_days = Column(Integer, nullable=False, default=0)                  # days inventory outstanding
    dpo_days = Column(Integer, nullable=False, default=0)                  # days payable outstanding

    # Full audit trail — every intermediate calculation step
    # Format: {
    #   "revenue": {
    #     "value": 5917838,
    #     "formula": "small_jobs + medium_jobs + large_jobs",
    #     "components": [
    #       {"label": "Small (5 × $800)", "value": 400000, "source": "forecast_driver"},
    #       {"label": "Medium (8 × $2,000)", "value": 1600000, "source": "forecast_driver"},
    #       {"label": "Large (2 × $8,000)", "value": 1600000, "source": "forecast_driver"}
    #     ]
    #   },
    #   "payroll_expenses": {...},
    #   ...
    # }
    calc_trace = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", "month",
                         name="uq_forecast_period_client_year_month"),
    )
