"""advisor-editable Scoreboard text: headline, priority reason, action item

The visual Scoreboard and its PDF auto-generate a headline, a one-line reason
for each top priority, and a stock action item per metric. The advisor can now
overwrite each in place. NULL means "use the auto wording", so nothing changes
until a field is written. These are client-facing and DO export — unlike
scoreboard_entries.notes, which stays private.

Revision ID: 028
Revises: 027
Create Date: 2026-09-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '028'
down_revision: Union[str, None] = '027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    cols = {c['name'] for c in insp.get_columns('scoreboard_entries')}
    if 'priority_reason' not in cols:
        op.add_column('scoreboard_entries', sa.Column('priority_reason', sa.Text(), nullable=True))
    if 'action_item' not in cols:
        op.add_column('scoreboard_entries', sa.Column('action_item', sa.Text(), nullable=True))

    if 'scoreboard_pages' not in insp.get_table_names():
        op.create_table(
            'scoreboard_pages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('client_id', sa.Integer(), nullable=False),
            sa.Column('fiscal_year', sa.Integer(), nullable=False),
            sa.Column('headline', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('client_id', 'fiscal_year', name='uq_scoreboard_page'),
        )


def downgrade() -> None:
    op.drop_table('scoreboard_pages')
    with op.batch_alter_table('scoreboard_entries') as batch:
        batch.drop_column('action_item')
        batch.drop_column('priority_reason')
