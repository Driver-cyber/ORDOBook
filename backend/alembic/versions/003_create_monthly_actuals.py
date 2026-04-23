"""create monthly actuals table

Revision ID: 003
Revises: 002
Create Date: 2026-03-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "monthly_actuals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),

        # Income Statement (stored as cents / BIGINT to avoid floating point)
        sa.Column("revenue", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cost_of_sales", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("payroll_expenses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("marketing_expenses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("depreciation_amortization", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("overhead_expenses", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("other_income_expense", sa.BigInteger(), nullable=False, server_default="0"),

        # Balance Sheet (stored as cents / BIGINT)
        sa.Column("cash", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("accounts_receivable", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("inventory", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("other_current_assets", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("total_fixed_assets", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("total_other_long_term_assets", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("accounts_payable", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("other_current_liabilities", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("total_long_term_liabilities", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("equity_before_net_profit", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("net_profit_for_year", sa.BigInteger(), nullable=False, server_default="0"),

        # Manually entered
        sa.Column("job_count", sa.Integer(), nullable=False, server_default="0"),

        # Audit trail — full parsed rows before mapping, stored for traceability
        sa.Column("raw_data", sa.JSON(), nullable=False, server_default="'{}'"),
        sa.Column("source_files", sa.JSON(), nullable=False, server_default="'[]'"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),

        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id", "fiscal_year", "month", name="uq_monthly_actuals_period"),
    )
    op.create_index("ix_monthly_actuals_id", "monthly_actuals", ["id"])
    op.create_index("ix_monthly_actuals_client_year", "monthly_actuals", ["client_id", "fiscal_year"])


def downgrade() -> None:
    op.drop_index("ix_monthly_actuals_client_year", table_name="monthly_actuals")
    op.drop_index("ix_monthly_actuals_id", table_name="monthly_actuals")
    op.drop_table("monthly_actuals")
