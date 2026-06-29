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
    # DB-agnostic + idempotent: `ADD COLUMN IF NOT EXISTS` is PostgreSQL-only
    # (invalid in SQLite), so inspect existing columns and add only what's missing
    # via op.add_column (matches the pattern in migrations 014/015).
    new_columns = [
        ('projected_ar', sa.BigInteger()),
        ('projected_inventory', sa.BigInteger()),
        ('projected_ap', sa.BigInteger()),
        ('owner_distributions', sa.BigInteger()),
        ('owner_tax_savings', sa.BigInteger()),
        ('net_cash_flow', sa.BigInteger()),
        ('dso_days', sa.Integer()),
        ('dio_days', sa.Integer()),
        ('dpo_days', sa.Integer()),
    ]

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c['name'] for c in inspector.get_columns('forecast_periods')}

    for name, coltype in new_columns:
        if name not in existing:
            op.add_column(
                'forecast_periods',
                sa.Column(name, coltype, nullable=False, server_default='0'),
            )


def downgrade() -> None:
    for col in ["projected_ar", "projected_inventory", "projected_ap", "owner_distributions",
                "owner_tax_savings", "net_cash_flow", "dso_days", "dio_days", "dpo_days"]:
        op.drop_column("forecast_periods", col)
