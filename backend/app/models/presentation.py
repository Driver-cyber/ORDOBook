from datetime import datetime, timezone
from sqlalchemy import (Column, Integer, String, DateTime, ForeignKey, JSON,
                        Index, UniqueConstraint)
from app.database import Base


class Presentation(Base):
    """One client review, stored as an ordered list of typed panels.

    See app.engine.panels for the panel schema. Versioned: presenting closes a
    version, and a later edit opens the next one, so the thing that was actually
    shown stays readable — next month's action_review panel reads from it.
    """
    __tablename__ = "presentations"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    fiscal_year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    version = Column(Integer, nullable=False, default=1, server_default="1")
    title = Column(String(500), nullable=False, default="", server_default="")
    status = Column(String(20), nullable=False, default="draft", server_default="draft")
    panels = Column(JSON, nullable=False, default=list)

    generated_at = Column(DateTime(timezone=True), nullable=True)
    presented_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", "month", "version",
                         name="uq_presentations_client_period_version"),
        Index("ix_presentations_client_period", "client_id", "fiscal_year", "month"),
    )
