"""add COS pct, marketing, depreciation, other income/expense to forecast_configs

Revision ID: 008
Revises: 007
Create Date: 2026-03-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("forecast_configs",
        sa.Column("cos_pct_monthly", sa.JSON(), nullable=False, server_default="'{}'"))
    op.add_column("forecast_configs",
        sa.Column("marketing_monthly", sa.JSON(), nullable=False, server_default="'{}'"))
    op.add_column("forecast_configs",
        sa.Column("depreciation_monthly", sa.JSON(), nullable=False, server_default="'{}'"))
    op.add_column("forecast_configs",
        sa.Column("other_income_expense_monthly", sa.JSON(), nullable=False, server_default="'{}'"))


def downgrade() -> None:
    op.drop_column("forecast_configs", "other_income_expense_monthly")
    op.drop_column("forecast_configs", "depreciation_monthly")
    op.drop_column("forecast_configs", "marketing_monthly")
    op.drop_column("forecast_configs", "cos_pct_monthly")
