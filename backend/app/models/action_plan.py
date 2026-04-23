from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Index
from app.database import Base


class ActionPlanItem(Base):
    __tablename__ = "action_plan_items"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    objective = Column(Text, nullable=False, default="")
    current_results = Column(Text, nullable=True)
    next_steps = Column(Text, nullable=True)
    owner = Column(String(100), nullable=True)
    due_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)  # private advisor note — never exported

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_action_plan_client_year", "client_id", "fiscal_year"),
    )
