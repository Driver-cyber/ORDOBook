"""the presentation as a stored, versioned list of panels

A presentation belongs to a period and is an ordered list of typed panels, each
carrying bound figures plus authored prose (app.engine.panels).

Versioned rather than immutable. A presented presentation must not silently
change — next month's `action_review` panel reads from it, and if it can be
edited afterwards then "what we committed to last month" rots. But the first time
a typo is spotted ten minutes after a meeting, an absolute freeze is the wrong
tool. So: presenting stamps `presented_at` and closes that version; a further edit
opens a new version, and the presented one stays readable forever.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '034'
down_revision: Union[str, None] = '033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "presentations" in inspector.get_table_names():
        return

    op.create_table(
        "presentations",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("client_id", sa.Integer(),
                  sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        # The month the presentation reviews. The period is the identity: one
        # conversation per close.
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title", sa.String(500), nullable=False, server_default=""),
        # "draft" until presented, then "presented" and closed to edits.
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("panels", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("presented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("client_id", "fiscal_year", "month", "version",
                            name="uq_presentations_client_period_version"),
    )
    op.create_index("ix_presentations_client_period", "presentations",
                    ["client_id", "fiscal_year", "month"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "presentations" not in inspector.get_table_names():
        return
    op.drop_index("ix_presentations_client_period", table_name="presentations")
    op.drop_table("presentations")
