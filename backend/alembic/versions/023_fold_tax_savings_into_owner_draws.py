"""fold owner_tax_savings into owner_distributions

The Tax Savings Reserve was a disaggregated view of owner draws that no longer
has its own line in ORDOBOOK — draws are entered inclusive of any reserve. The
engine computed owner_draws = distributions + tax_savings, so folding the
reserve into distributions month-by-month keeps every owner-draws figure
identical while letting the engine stop reading the field.

Data-only: no columns change, so the models still match the migrations.
Idempotent: a second run finds nothing left to fold.

Revision ID: 023
Revises: 022
Create Date: 2026-09-10
"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '023'
down_revision: Union[str, None] = '022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _as_dict(v) -> dict:
    if v is None:
        return {}
    if isinstance(v, str):
        try:
            return json.loads(v) or {}
        except ValueError:
            return {}
    return dict(v)


def upgrade() -> None:
    conn = op.get_bind()
    t = sa.table(
        'forecast_configs',
        sa.column('id', sa.Integer),
        sa.column('owner_distributions', sa.JSON),
        sa.column('owner_tax_savings', sa.JSON),
    )
    rows = conn.execute(sa.select(t.c.id, t.c.owner_distributions, t.c.owner_tax_savings)).fetchall()
    for row_id, dist, tax in rows:
        tax_d = _as_dict(tax)
        if not any(int(v or 0) for v in tax_d.values()):
            continue  # nothing to fold (or already folded)
        merged = {str(k): int(v or 0) for k, v in _as_dict(dist).items()}
        for m, v in tax_d.items():
            merged[str(m)] = merged.get(str(m), 0) + int(v or 0)
        conn.execute(
            t.update().where(t.c.id == row_id)
             .values(owner_distributions=merged, owner_tax_savings={})
        )


def downgrade() -> None:
    # Irreversible by design: once folded there is no record of which part of a
    # month's distributions was the reserve. The column is retained, so nothing
    # structural needs undoing.
    pass
