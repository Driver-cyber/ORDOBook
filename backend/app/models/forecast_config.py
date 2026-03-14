from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class ForecastConfig(Base):
    __tablename__ = "forecast_configs"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)

    # Revenue — per-month JSONB dicts keyed "1"–"12"
    small_job_counts = Column(JSONB, nullable=False, default=dict)           # {"1": 5, "2": 4, ...}
    small_job_avg_value = Column(BigInteger, nullable=False, default=0)      # legacy scalar (kept for data safety)
    small_job_avg_value_monthly = Column(JSONB, nullable=False, default=dict) # {"1": 80000, ...} cents

    medium_job_counts = Column(JSONB, nullable=False, default=dict)
    medium_job_avg_value = Column(BigInteger, nullable=False, default=0)
    medium_job_avg_value_monthly = Column(JSONB, nullable=False, default=dict)

    large_job_counts = Column(JSONB, nullable=False, default=dict)
    large_job_avg_value = Column(BigInteger, nullable=False, default=0)
    large_job_avg_value_monthly = Column(JSONB, nullable=False, default=dict)

    # Payroll
    cost_per_pay_run = Column(BigInteger, nullable=False, default=0)           # legacy scalar (kept for fallback)
    cost_per_pay_run_monthly = Column(JSONB, nullable=False, default=dict)     # {"1": 250000, ...} cents per month
    pay_runs_per_month = Column(JSONB, nullable=False, default=dict)           # {"1": 2, "2": 2, ...}
    payroll_one_off = Column(JSONB, nullable=False, default=dict)              # {"3": 25000, ...} cents

    # Owner Draws
    owner_distributions = Column(JSONB, nullable=False, default=dict)  # {"1": 500000, ...} cents
    owner_tax_savings = Column(JSONB, nullable=False, default=dict)    # {"1": 100000, ...} cents

    # Overhead — flexible named line items (kept for legacy/future use)
    # Format: [{"name": "Rent", "monthly": {"1": 250000, "2": 250000, ...}}, ...]
    overhead_schedule = Column(JSONB, nullable=False, default=list)

    # Other overhead — single editable per-month catch-all (rent, utilities, etc.)
    other_overhead_monthly = Column(JSONB, nullable=False, default=dict)  # {"1": 250000, ...} cents

    # Cost of Sales — per-month percentage of revenue (e.g., {"1": 35.5, "2": 36.0})
    cos_pct_monthly = Column(JSONB, nullable=False, default=dict)

    # Other expenses — per-month dollar amounts in cents
    marketing_monthly = Column(JSONB, nullable=False, default=dict)       # {"1": 50000, ...}
    depreciation_monthly = Column(JSONB, nullable=False, default=dict)    # {"1": 25000, ...}

    # Other income/expense — per-month cents, can be negative
    other_income_expense_monthly = Column(JSONB, nullable=False, default=dict)

    # Cash flow drivers — per-month days (integer, not cents)
    dso_monthly = Column(JSONB, nullable=False, default=dict)  # {"1": 30, ...} days sales outstanding
    dio_monthly = Column(JSONB, nullable=False, default=dict)  # {"1": 0, ...} days inventory outstanding
    dpo_monthly = Column(JSONB, nullable=False, default=dict)  # {"1": 30, ...} days payable outstanding

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", name="uq_forecast_config_client_year"),
    )
