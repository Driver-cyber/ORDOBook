from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Index, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class ActionPlanItem(Base):
    """An objective on the year's Action Plan. Its action items live in
    ActionPlanStep (migration 027); before that this row also carried a single
    next_steps / owner / due_date."""
    __tablename__ = "action_plan_items"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    objective = Column(Text, nullable=False, default="")
    current_results = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)  # private advisor note — never exported

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    steps = relationship(
        "ActionPlanStep",
        order_by="ActionPlanStep.sort_order, ActionPlanStep.id",
        cascade="all, delete-orphan",
        back_populates="objective_row",
    )

    __table_args__ = (
        Index("ix_action_plan_client_year", "client_id", "fiscal_year"),
    )


class ActionPlanStep(Base):
    """One action item under an objective: what, who (one or more owners from
    the client's roster), and when. completed_at is reserved for completion
    tracking (Product 2 handoff) — stored, not yet surfaced."""
    __tablename__ = "action_plan_steps"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("action_plan_items.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    text = Column(Text, nullable=False, default="")
    owners = Column(JSON, nullable=False, default=list)  # ["Doug", "Chad"]
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    objective_row = relationship("ActionPlanItem", back_populates="steps")

    __table_args__ = (
        Index("ix_action_plan_steps_item", "item_id"),
    )
