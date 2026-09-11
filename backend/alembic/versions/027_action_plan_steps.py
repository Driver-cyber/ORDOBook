"""action plan: objectives with nested action items; owner roster on clients

Each Action Plan row was one flat item (objective + next steps + one owner +
one due date). The plan is now objectives (action_plan_items) with up to a
few action items each (action_plan_steps), every action item carrying its own
owners and due date. Existing rows migrate losslessly: an item's next_steps /
owner / due_date become its first step, then those three columns are dropped.

clients.action_plan_owners is the roster the owner chips pick from.

Revision ID: 027
Revises: 026
Create Date: 2026-09-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '027'
down_revision: Union[str, None] = '026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    # 1. Steps table (skip if create_all already made it).
    if 'action_plan_steps' not in insp.get_table_names():
        op.create_table(
            'action_plan_steps',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('item_id', sa.Integer(), nullable=False),
            sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('text', sa.Text(), nullable=False, server_default=''),
            # sa.text() so the default is emitted verbatim; a plain string is
            # re-quoted and Postgres rejects it as JSON (lesson from 025).
            sa.Column('owners', sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
            sa.Column('due_date', sa.Date(), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['item_id'], ['action_plan_items.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_action_plan_steps_item', 'action_plan_steps', ['item_id'])

    # 2. Copy each item's flat next-step into a step row, then drop the columns.
    item_cols = {c['name'] for c in insp.get_columns('action_plan_items')}
    legacy = {'next_steps', 'owner', 'due_date'} & item_cols
    if legacy:
        items = sa.table('action_plan_items',
            sa.column('id', sa.Integer),
            sa.column('next_steps', sa.Text),
            sa.column('owner', sa.String),
            sa.column('due_date', sa.Date))
        steps = sa.table('action_plan_steps',
            sa.column('item_id', sa.Integer),
            sa.column('sort_order', sa.Integer),
            sa.column('text', sa.Text),
            sa.column('owners', sa.JSON),
            sa.column('due_date', sa.Date))
        rows = conn.execute(sa.select(items.c.id, items.c.next_steps, items.c.owner, items.c.due_date)).fetchall()
        for item_id, next_steps, owner, due_date in rows:
            if not (next_steps or owner or due_date):
                continue
            conn.execute(steps.insert().values(
                item_id=item_id, sort_order=0,
                text=next_steps or '',
                owners=[owner.strip()] if owner and owner.strip() else [],
                due_date=due_date,
            ))
        # batch mode so SQLite (no DROP COLUMN on older versions) recreates the table.
        with op.batch_alter_table('action_plan_items') as batch:
            for col in ('next_steps', 'owner', 'due_date'):
                if col in item_cols:
                    batch.drop_column(col)

    # 3. Owner roster on the client.
    client_cols = {c['name'] for c in sa.inspect(conn).get_columns('clients')}
    if 'action_plan_owners' not in client_cols:
        op.add_column('clients',
            sa.Column('action_plan_owners', sa.JSON(), nullable=False,
                      server_default=sa.text("'[]'")))


def downgrade() -> None:
    op.drop_column('clients', 'action_plan_owners')
    with op.batch_alter_table('action_plan_items') as batch:
        batch.add_column(sa.Column('next_steps', sa.Text(), nullable=True))
        batch.add_column(sa.Column('owner', sa.String(100), nullable=True))
        batch.add_column(sa.Column('due_date', sa.Date(), nullable=True))
    op.drop_index('ix_action_plan_steps_item', table_name='action_plan_steps')
    op.drop_table('action_plan_steps')
