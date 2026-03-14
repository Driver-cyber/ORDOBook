"""add cost_per_pay_run_monthly (re-apply after rollback)

Revision ID: 014
Revises: 013
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '014'
down_revision: Union[str, None] = '013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS to be safe — column may or may not exist
    op.execute(
        "ALTER TABLE forecast_configs ADD COLUMN IF NOT EXISTS "
        "cost_per_pay_run_monthly JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:
    op.drop_column("forecast_configs", "cost_per_pay_run_monthly")
