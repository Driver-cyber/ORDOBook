"""create clients table

Revision ID: 001
Revises:
Create Date: 2026-03-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("industry", sa.String(length=255), nullable=True),
        sa.Column("fiscal_year_start_month", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("timezone", sa.String(length=100), nullable=True, server_default="America/Chicago"),
        sa.Column("terminology_config", JSONB(), nullable=True, server_default="{}"),
        sa.Column("advisor_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_clients_id", "clients", ["id"])
    op.create_index("ix_clients_name", "clients", ["name"])


def downgrade() -> None:
    op.drop_index("ix_clients_name", table_name="clients")
    op.drop_index("ix_clients_id", table_name="clients")
    op.drop_table("clients")
