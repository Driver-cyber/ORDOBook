"""add full cash flow fields (CapEx, debt, WC deltas)

Revision ID: 017
Revises: 016
Create Date: 2026-03-23
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '017'
down_revision: Union[str, None] = '016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── forecast_configs: 4 new driver input fields ────────────────────────
    op.add_column('forecast_configs',
        sa.Column('capex_monthly', postgresql.JSONB(), nullable=False, server_default='{}'))
    op.add_column('forecast_configs',
        sa.Column('other_current_assets_change_monthly', postgresql.JSONB(), nullable=False, server_default='{}'))
    op.add_column('forecast_configs',
        sa.Column('current_debt_change_monthly', postgresql.JSONB(), nullable=False, server_default='{}'))
    op.add_column('forecast_configs',
        sa.Column('long_term_debt_change_monthly', postgresql.JSONB(), nullable=False, server_default='{}'))

    # ── forecast_periods: 10 new computed output fields ────────────────────
    # Working capital deltas
    op.add_column('forecast_periods',
        sa.Column('ar_change', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('inventory_change', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('ap_change', sa.BigInteger(), nullable=False, server_default='0'))
    # Investing / financing flows
    op.add_column('forecast_periods',
        sa.Column('capex', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('other_current_assets_change', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('current_debt_change', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('long_term_debt_change', sa.BigInteger(), nullable=False, server_default='0'))
    # Running balance sheet projections
    op.add_column('forecast_periods',
        sa.Column('projected_other_current_assets', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('projected_current_debt', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('forecast_periods',
        sa.Column('projected_long_term_debt', sa.BigInteger(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('forecast_periods', 'projected_long_term_debt')
    op.drop_column('forecast_periods', 'projected_current_debt')
    op.drop_column('forecast_periods', 'projected_other_current_assets')
    op.drop_column('forecast_periods', 'long_term_debt_change')
    op.drop_column('forecast_periods', 'current_debt_change')
    op.drop_column('forecast_periods', 'other_current_assets_change')
    op.drop_column('forecast_periods', 'capex')
    op.drop_column('forecast_periods', 'ap_change')
    op.drop_column('forecast_periods', 'inventory_change')
    op.drop_column('forecast_periods', 'ar_change')
    op.drop_column('forecast_configs', 'long_term_debt_change_monthly')
    op.drop_column('forecast_configs', 'current_debt_change_monthly')
    op.drop_column('forecast_configs', 'other_current_assets_change_monthly')
    op.drop_column('forecast_configs', 'capex_monthly')
