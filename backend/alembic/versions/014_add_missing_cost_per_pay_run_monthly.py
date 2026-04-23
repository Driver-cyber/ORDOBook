"""add cost_per_pay_run_monthly (re-apply after rollback)

Revision ID: 014
Revises: 013
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '014'
down_revision: Union[str, None] = '013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent re-apply: column may already exist from migration 012
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('forecast_configs')]
    if 'cost_per_pay_run_monthly' not in cols:
        op.add_column('forecast_configs',
            sa.Column('cost_per_pay_run_monthly', sa.JSON(), nullable=False, server_default="'{}'"))


def downgrade() -> None:
    op.drop_column("forecast_configs", "cost_per_pay_run_monthly")
