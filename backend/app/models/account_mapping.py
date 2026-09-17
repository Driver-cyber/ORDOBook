from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from app.database import Base


class AccountMapping(Base):
    __tablename__ = "account_mappings"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    report_type = Column(String(50), nullable=False)  # "profit_and_loss" | "balance_sheet"
    qb_account_name = Column(String(500), nullable=False)
    # Part of the mapping's identity (032): the same account name legitimately owns
    # a row in two sections of one statement, and they can carry different categories.
    section = Column(String(50), nullable=False, default="", server_default="")
    ordobook_category = Column(String(100), nullable=False)
    is_excluded = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("client_id", "report_type", "section", "qb_account_name",
                         name="uq_account_mappings_client_report_section_account"),
    )
