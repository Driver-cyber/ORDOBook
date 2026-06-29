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
    bigint_cols = [
        "projected_ar", "projected_inventory", "projected_ap",
        "owner_distributions", "owner_tax_savings", "net_cash_flow",
    ]
    integer_cols = ["dso_days", "dio_days", "dpo_days"]

    conn = op.get_bind()
    existing = {c["name"] for c in sa.inspect(conn).get_columns("forecast_periods")}

    for col in bigint_cols:
        if col not in existing:
            op.add_column(
                "forecast_periods",
                sa.Column(col, sa.BigInteger(), nullable=False, server_default="0"),
            )
    for col in integer_cols:
        if col not in existing:
            op.add_column(
                "forecast_periods",
                sa.Column(col, sa.Integer(), nullable=False, server_default="0"),
            )


def downgrade() -> None:
    for col in ["projected_ar", "projected_inventory", "projected_ap", "owner_distributions",
                "owner_tax_savings", "net_cash_flow", "dso_days", "dio_days", "dpo_days"]:
        op.drop_column("forecast_periods", col)
