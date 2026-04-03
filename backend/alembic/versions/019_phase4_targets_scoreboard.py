"""Phase 4: client_targets and scoreboard_entries tables
Revision ID: 019
Revises: 018
Create Date: 2026-03-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '019'
down_revision: Union[str, None] = '018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'client_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('fiscal_year', sa.Integer(), nullable=False),
        sa.Column('metric_key', sa.String(50), nullable=False),
        sa.Column('target_value', sa.BigInteger(), nullable=False),
        sa.Column('target_type', sa.String(10), nullable=False, server_default='cents'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_id', 'fiscal_year', 'metric_key', name='uq_client_target_key'),
    )
    op.create_index('ix_client_targets_id', 'client_targets', ['id'])

    op.create_table(
        'scoreboard_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('fiscal_year', sa.Integer(), nullable=False),
        sa.Column('metric_key', sa.String(50), nullable=False),
        sa.Column('grade', sa.String(10), nullable=True),
        sa.Column('grade_is_override', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_top_priority', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_id', 'fiscal_year', 'metric_key', name='uq_scoreboard_entry'),
    )
    op.create_index('ix_scoreboard_entries_id', 'scoreboard_entries', ['id'])


def downgrade() -> None:
    op.drop_index('ix_scoreboard_entries_id', table_name='scoreboard_entries')
    op.drop_table('scoreboard_entries')
    op.drop_index('ix_client_targets_id', table_name='client_targets')
    op.drop_table('client_targets')
