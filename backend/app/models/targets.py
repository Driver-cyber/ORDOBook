from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, String, Boolean, Text, DateTime, ForeignKey, UniqueConstraint
from app.database import Base


class ClientTarget(Base):
    __tablename__ = "client_targets"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    metric_key = Column(String(50), nullable=False)
    # Cents for money metrics; raw integer for count/days metrics
    target_value = Column(BigInteger, nullable=False)
    # "cents" | "count" | "days"
    target_type = Column(String(10), nullable=False, default="cents")

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", "metric_key",
                         name="uq_client_target_key"),
    )


class ScoreboardEntry(Base):
    __tablename__ = "scoreboard_entries"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    metric_key = Column(String(50), nullable=False)
    # "green" | "yellow" | "red"
    grade = Column(String(10), nullable=True)
    # True = advisor manually set this grade; False = auto-computed
    grade_is_override = Column(Boolean, nullable=False, default=False)
    # For red items: is this one of the (max 3) top priorities this period?
    is_top_priority = Column(Boolean, nullable=False, default=False)
    # Private per-metric advisor note — never appears in any client-facing export
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "fiscal_year", "metric_key",
                         name="uq_scoreboard_entry"),
    )
