"""create account mappings table

Revision ID: 002
Revises: 001
Create Date: 2026-03-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "account_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("qb_account_name", sa.String(length=500), nullable=False),
        sa.Column("ordobook_category", sa.String(length=100), nullable=False),
        sa.Column("is_excluded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id", "qb_account_name", name="uq_account_mappings_client_account"),
    )
    op.create_index("ix_account_mappings_id", "account_mappings", ["id"])
    op.create_index("ix_account_mappings_client_id", "account_mappings", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_account_mappings_client_id", table_name="account_mappings")
    op.drop_index("ix_account_mappings_id", table_name="account_mappings")
    op.drop_table("account_mappings")
