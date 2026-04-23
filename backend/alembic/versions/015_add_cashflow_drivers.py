"""add cash flow driver fields to forecast_configs

Revision ID: 015
Revises: 014
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '015'
down_revision: Union[str, None] = '014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: check before adding in case of prior partial run
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c['name'] for c in inspector.get_columns('forecast_configs')}
    for col_name in ('dso_monthly', 'dio_monthly', 'dpo_monthly'):
        if col_name not in existing:
            op.add_column('forecast_configs',
                sa.Column(col_name, sa.JSON(), nullable=False, server_default="'{}'"))


def downgrade() -> None:
    op.drop_column("forecast_configs", "dso_monthly")
    op.drop_column("forecast_configs", "dio_monthly")
    op.drop_column("forecast_configs", "dpo_monthly")
