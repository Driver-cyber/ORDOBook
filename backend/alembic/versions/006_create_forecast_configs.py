"""create forecast_configs table

Revision ID: 006
Revises: 005
Create Date: 2026-03-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "forecast_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),

        # Revenue
        sa.Column("small_job_counts", JSONB(), nullable=False, server_default="{}"),
        sa.Column("small_job_avg_value", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("medium_job_counts", JSONB(), nullable=False, server_default="{}"),
        sa.Column("medium_job_avg_value", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("large_job_counts", JSONB(), nullable=False, server_default="{}"),
        sa.Column("large_job_avg_value", sa.BigInteger(), nullable=False, server_default="0"),

        # Payroll
        sa.Column("cost_per_pay_run", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("pay_runs_per_month", JSONB(), nullable=False, server_default="{}"),
        sa.Column("payroll_one_off", JSONB(), nullable=False, server_default="{}"),

        # Owner Draws
        sa.Column("owner_distributions", JSONB(), nullable=False, server_default="{}"),
        sa.Column("owner_tax_savings", JSONB(), nullable=False, server_default="{}"),

        # Overhead
        sa.Column("overhead_schedule", JSONB(), nullable=False, server_default="[]"),

        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),

        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("client_id", "fiscal_year", name="uq_forecast_config_client_year"),
    )
    op.create_index("ix_forecast_configs_id", "forecast_configs", ["id"])


def downgrade() -> None:
    op.drop_index("ix_forecast_configs_id", table_name="forecast_configs")
    op.drop_table("forecast_configs")
