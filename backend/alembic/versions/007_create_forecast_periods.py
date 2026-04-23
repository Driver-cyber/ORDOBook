"""create forecast_periods table

Revision ID: 007
Revises: 006
Create Date: 2026-03-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "forecast_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("config_id", sa.Integer(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False, server_default="forecast"),

        # Financial outputs (cents)
        sa.Column("revenue", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cost_of_sales", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("gross_profit", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("payroll_expenses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("marketing_expenses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("depreciation_amortization", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("overhead_expenses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("net_operating_profit", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("other_income_expense", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("net_profit", sa.BigInteger(), nullable=False, server_default="0"),

        # Derived metrics
        sa.Column("total_job_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("blended_avg_job_value", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("owner_total_draws", sa.BigInteger(), nullable=False, server_default="0"),

        # Audit trail
        sa.Column("calc_trace", sa.JSON(), nullable=False, server_default="'{}'"),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),

        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["config_id"], ["forecast_configs.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("client_id", "fiscal_year", "month",
                            name="uq_forecast_period_client_year_month"),
    )
    op.create_index("ix_forecast_periods_id", "forecast_periods", ["id"])


def downgrade() -> None:
    op.drop_index("ix_forecast_periods_id", table_name="forecast_periods")
    op.drop_table("forecast_periods")
