"""add notes to forecast_configs

Revision ID: 013
Revises: 012
Create Date: 2026-03-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '013'
down_revision: Union[str, None] = '012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: migration 006 also defines `notes` on forecast_configs.
    # On a fresh build 006 creates it first, so guard against a duplicate-column
    # error here (matches the inspector pattern used in migrations 014/015).
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = [c["name"] for c in inspector.get_columns("forecast_configs")]
    if "notes" not in cols:
        op.add_column(
            "forecast_configs",
            sa.Column("notes", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("forecast_configs", "notes")
