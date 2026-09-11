"""add owner_distributions to monthly_actuals

Owner draws / distributions / contributions were being mapped into the general
equity bucket, so the actuals months of the Forecast had no owner activity and
the Targets prior-year column had to back it out of an equity roll-forward. This
gives them their own Balance Sheet category. Stored the way QB shows the equity
line: a signed YTD balance (draws negative, investments positive) that resets
each fiscal year — the same shape as net_profit_for_year. Never sum it across
months; the month's activity is this month's balance minus last month's.

Revision ID: 026
Revises: 025
Create Date: 2026-09-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '026'
down_revision: Union[str, None] = '025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    cols = [c['name'] for c in sa.inspect(conn).get_columns('monthly_actuals')]
    if 'owner_distributions' not in cols:
        op.add_column('monthly_actuals',
            # sa.text() so the default is emitted verbatim (DEFAULT 0) on every dialect.
            sa.Column('owner_distributions', sa.BigInteger(), nullable=False,
                      server_default=sa.text('0')))


def downgrade() -> None:
    op.drop_column('monthly_actuals', 'owner_distributions')
