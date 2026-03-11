"""add other_overhead_monthly to forecast_configs

Revision ID: 009
Revises: 008
Create Date: 2026-03-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forecast_configs",
        sa.Column("other_overhead_monthly", JSONB, nullable=False, server_default='{}'),
    )


def downgrade() -> None:
    op.drop_column("forecast_configs", "other_overhead_monthly")
