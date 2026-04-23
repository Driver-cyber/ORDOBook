"""add cost_per_pay_run_monthly to forecast_configs

Revision ID: 012
Revises: 011
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '012'
down_revision: Union[str, None] = '011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forecast_configs",
        sa.Column("cost_per_pay_run_monthly", sa.JSON(), nullable=False, server_default="'{}'"),
    )


def downgrade() -> None:
    op.drop_column("forecast_configs", "cost_per_pay_run_monthly")
