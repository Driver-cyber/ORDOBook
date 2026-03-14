"""add cash flow output fields to forecast_periods

Revision ID: 016
Revises: 015
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '016'
down_revision: Union[str, None] = '015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS projected_ar BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS projected_inventory BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS projected_ap BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS owner_distributions BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS owner_tax_savings BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS net_cash_flow BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS dso_days INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS dio_days INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE forecast_periods ADD COLUMN IF NOT EXISTS dpo_days INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    for col in ["projected_ar", "projected_inventory", "projected_ap", "owner_distributions",
                "owner_tax_savings", "net_cash_flow", "dso_days", "dio_days", "dpo_days"]:
        op.drop_column("forecast_periods", col)
