from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy import JSON
from app.database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    industry = Column(String(255), nullable=True)
    fiscal_year_start_month = Column(Integer, default=1)  # 1=January, 7=July, etc.
    timezone = Column(String(100), default="America/Chicago")
    terminology_config = Column(JSON, default=dict)  # e.g. {"jobs": "Projects"}
    advisor_notes = Column(Text, nullable=True)  # Private, never exported
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
