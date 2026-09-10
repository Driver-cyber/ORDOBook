"""add notes to client_targets

Per-metric advisor note on the Targets page — the rationale behind a target
("why 18 DPO?"), captured next to the number rather than in a separate doc.

Distinct from ScoreboardEntry.notes, which records how a metric performed.
This records why the target was set.

Revision ID: 022
Revises: 021
Create Date: 2026-09-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '022'
down_revision: Union[str, None] = '021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent guard: matches the inspector pattern used in 013/014/015/016 so a
    # re-run or a partially-applied database doesn't fail on a duplicate column.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c['name'] for c in inspector.get_columns('client_targets')]
    if 'notes' not in cols:
        op.add_column('client_targets', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('client_targets', 'notes')
