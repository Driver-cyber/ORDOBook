"""add cos_fixed_monthly to forecast_configs

Lets a Cost of Sales month be pinned to a fixed dollar amount. COS stays a % of
revenue by default; a month with an entry here uses that amount instead and
does not move when revenue drivers change. Entering a % for that month again
releases the pin.

Revision ID: 025
Revises: 024
Create Date: 2026-09-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '025'
down_revision: Union[str, None] = '024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    cols = [c['name'] for c in sa.inspect(conn).get_columns('forecast_configs')]
    if 'cos_fixed_monthly' not in cols:
        op.add_column('forecast_configs',
            # sa.text() so the default is emitted verbatim as '{}'. A plain string is
            # re-quoted by the dialect ('''{}''') and Postgres rejects it as JSON.
            sa.Column('cos_fixed_monthly', sa.JSON(), nullable=False,
                      server_default=sa.text("'{}'")))


def downgrade() -> None:
    op.drop_column('forecast_configs', 'cos_fixed_monthly')
