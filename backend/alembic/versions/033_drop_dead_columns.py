"""drop three columns nothing reads

  * account_mappings.is_excluded — migration 030 retired the "Excluded" mapping
    and set every row to false. Nothing has read it since; the write path kept
    setting it to false out of habit. A flag nothing honours is worse than no
    flag: the next reader assumes it works.

  * forecast_configs.owner_tax_savings and forecast_periods.owner_tax_savings —
    migration 023 folded the tax reserve into owner distributions. Both have been
    a constant zero ever since, threaded through ten places.

Nothing is read, so nothing is preserved. downgrade() restores the columns with
their original defaults, which is exactly the state 030 and 023 left them in.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '033'
down_revision: Union[str, None] = '032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column, restore-with)
_DEAD = [
    ("account_mappings", "is_excluded",
     lambda: sa.Column("is_excluded", sa.Boolean(), nullable=False, server_default=sa.false())),
    ("forecast_configs", "owner_tax_savings",
     lambda: sa.Column("owner_tax_savings", sa.JSON(), nullable=False, server_default=sa.text("'{}'"))),
    ("forecast_periods", "owner_tax_savings",
     lambda: sa.Column("owner_tax_savings", sa.BigInteger(), nullable=False, server_default="0")),
]


def _columns(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, column, _ in _DEAD:
        if table in tables and column in _columns(inspector, table):
            # batch mode: SQLite cannot DROP COLUMN on older versions, and SQLite
            # is what the packaged app ships with.
            with op.batch_alter_table(table) as batch:
                batch.drop_column(column)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, column, make in _DEAD:
        if table in tables and column not in _columns(inspector, table):
            op.add_column(table, make())
