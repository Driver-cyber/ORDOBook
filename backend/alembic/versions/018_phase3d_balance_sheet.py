"""Phase 3d: projected cash, fixed assets, total assets, liabilities, equity

Revision ID: 018
Revises: 017
Create Date: 2026-03-27
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '018'
down_revision: Union[str, None] = '017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('forecast_periods', sa.Column('projected_cash', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_fixed_assets', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_other_lt_assets', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_total_current_assets', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_total_assets', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_total_current_liabilities', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_total_liabilities', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods', sa.Column('projected_equity', sa.BigInteger(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('forecast_periods', 'projected_equity')
    op.drop_column('forecast_periods', 'projected_total_liabilities')
    op.drop_column('forecast_periods', 'projected_total_current_liabilities')
    op.drop_column('forecast_periods', 'projected_total_assets')
    op.drop_column('forecast_periods', 'projected_total_current_assets')
    op.drop_column('forecast_periods', 'projected_other_lt_assets')
    op.drop_column('forecast_periods', 'projected_fixed_assets')
    op.drop_column('forecast_periods', 'projected_cash')
