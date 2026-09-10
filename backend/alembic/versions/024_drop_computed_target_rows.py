"""remove derived metrics stored as client_targets rows

Revenue, gross/net profit and the cash-flow roll-ups were being computed in the
browser and then persisted alongside the driver targets so the Scoreboard could
grade against them — a second copy of every formula. They are now derived in
one place (app.engine.targets) from the drivers, so the stored copies are
retired. Data-only, idempotent, and reproducible from the drivers.

Revision ID: 024
Revises: 023
Create Date: 2026-09-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '024'
down_revision: Union[str, None] = '023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COMPUTED_KEYS = (
    "revenue", "gross_profit", "net_operating_profit", "net_profit",
    "cf_assets_change", "cf_liabilities_change", "net_cash_flow",
)


def upgrade() -> None:
    # A computed-key row can carry an advisor note (notes on Gross Profit etc.
    # live on the row). Keep those — their target_value is simply ignored now —
    # and remove only the note-less copies.
    t = sa.table('client_targets', sa.column('metric_key', sa.String), sa.column('notes', sa.Text))
    op.execute(
        t.delete().where(
            t.c.metric_key.in_(COMPUTED_KEYS),
            sa.or_(t.c.notes.is_(None), t.c.notes == ''),
        )
    )


def downgrade() -> None:
    # The rows are re-derivable from the drivers; nothing to restore.
    pass
