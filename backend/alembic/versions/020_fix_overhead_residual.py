"""Recompute overhead_expenses as residual (total - payroll - marketing - depreciation)

This matches the reference workbook definition: overhead = total_expenses minus the
three named buckets. Previously overhead was only the sum of accounts explicitly mapped
to the overhead category, which under-counted when any expense row fell through the cracks.

Revision ID: 020
Revises: 019
Create Date: 2026-04-09
"""
from typing import Sequence, Union
from alembic import op

revision: str = '020'
down_revision: Union[str, None] = '019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE monthly_actuals
        SET overhead_expenses = total_expenses
                              - payroll_expenses
                              - marketing_expenses
                              - depreciation_amortization
        WHERE total_expenses > 0
    """)


def downgrade() -> None:
    # Cannot recover the original per-account mapped values; leave as-is on downgrade.
    pass
