"""add per-month avg job value fields to forecast_configs

Revision ID: 010
Revises: 009
Create Date: 2026-03-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '010'
down_revision: Union[str, None] = '009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("forecast_configs", sa.Column("small_job_avg_value_monthly", sa.JSON(), nullable=False, server_default="'{}'"))
    op.add_column("forecast_configs", sa.Column("medium_job_avg_value_monthly", sa.JSON(), nullable=False, server_default="'{}'"))
    op.add_column("forecast_configs", sa.Column("large_job_avg_value_monthly", sa.JSON(), nullable=False, server_default="'{}'"))


def downgrade() -> None:
    op.drop_column("forecast_configs", "large_job_avg_value_monthly")
    op.drop_column("forecast_configs", "medium_job_avg_value_monthly")
    op.drop_column("forecast_configs", "small_job_avg_value_monthly")
