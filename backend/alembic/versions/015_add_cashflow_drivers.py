"""add cash flow driver fields to forecast_configs

Revision ID: 015
Revises: 014
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '015'
down_revision: Union[str, None] = '014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE forecast_configs ADD COLUMN IF NOT EXISTS dso_monthly JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE forecast_configs ADD COLUMN IF NOT EXISTS dio_monthly JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE forecast_configs ADD COLUMN IF NOT EXISTS dpo_monthly JSONB NOT NULL DEFAULT '{}'::jsonb")


def downgrade() -> None:
    op.drop_column("forecast_configs", "dso_monthly")
    op.drop_column("forecast_configs", "dio_monthly")
    op.drop_column("forecast_configs", "dpo_monthly")
