"""add overhead_detail_monthly to forecast_configs

Lets a forecast month's Overhead be built account by account instead of hard
keyed as one number. Shape: {"9": {"Rent": 250000, "Phone service": 34000}, ...}
— month key → account name → cents.

Resolution order for a month's overhead (app/engine/overhead.py):
  1. a key present in other_overhead_monthly  → that hard-keyed amount wins;
  2. otherwise a non-empty entry here         → the sum of its accounts;
  3. otherwise                                → 0.

Presence, not truthiness — the same rule COS pinning uses (migration 025). Filling
in the schedule DELETES that month's key from other_overhead_monthly so the sum
flows; typing in the grid writes the key back and overrides without touching the
schedule underneath; clearing the cell removes the key again and the schedule
returns. A hard-keyed $0 is honoured.

Existing configs carry a dense other_overhead_monthly (every month keyed), so
every month keeps reading exactly as it does today until the advisor opens a
schedule and fills it in.

Revision ID: 031
Revises: 030
Create Date: 2026-09-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '031'
down_revision: Union[str, None] = '030'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    cols = [c['name'] for c in sa.inspect(conn).get_columns('forecast_configs')]
    if 'overhead_detail_monthly' not in cols:
        op.add_column('forecast_configs',
            # sa.text() so the default is emitted verbatim as '{}'. A plain string is
            # re-quoted by the dialect ('''{}''') and Postgres rejects it as JSON.
            sa.Column('overhead_detail_monthly', sa.JSON(), nullable=False,
                      server_default=sa.text("'{}'")))


def downgrade() -> None:
    op.drop_column('forecast_configs', 'overhead_detail_monthly')
