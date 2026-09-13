"""cash-flow drivers become signed cash: draws, capex and other-current-asset
changes flip sign

Until now three Forecast drivers were entered in their "natural" sense —
owner distributions positive for a draw, capex positive for a purchase, other
current assets Δ positive when the balance grew — while the two debt rows were
signed cash (positive = borrowing). The engine subtracted the first three and
added the last two, so Net Cash Flow was right but the column couldn't be
summed as displayed, and the convention differed from Targets / Scoreboard.

From here every cash-flow line is SIGNED CASH: positive adds cash, negative
uses it. This flips the three stored driver dicts and the same four fields on
stored forecast periods, so nothing changes on screen except the sign the
advisor reads and types. Data-only; ledger-guarded (runs once).

Revision ID: 029
Revises: 028
Create Date: 2026-09-13
"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '029'
down_revision: Union[str, None] = '028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FLIP_DRIVERS = ('owner_distributions', 'capex_monthly', 'other_current_assets_change_monthly')
FLIP_PERIOD_COLS = ('owner_distributions', 'owner_total_draws', 'capex', 'other_current_assets_change')


def _as_dict(v):
    if v is None:
        return {}
    if isinstance(v, str):
        try:
            return json.loads(v) or {}
        except ValueError:
            return {}
    return dict(v)


def _flipped(d):
    return {str(k): -int(v or 0) for k, v in _as_dict(d).items()}


def _flip(direction: int) -> None:
    conn = op.get_bind()
    cols = {c['name'] for c in sa.inspect(conn).get_columns('forecast_configs')}
    present = [c for c in FLIP_DRIVERS if c in cols]
    if present:
        t = sa.table('forecast_configs', sa.column('id', sa.Integer),
                     *[sa.column(c, sa.JSON) for c in present])
        rows = conn.execute(sa.select(t.c.id, *[t.c[c] for c in present])).fetchall()
        for row in rows:
            row_id, *vals = row
            conn.execute(t.update().where(t.c.id == row_id)
                         .values(**{c: _flipped(v) for c, v in zip(present, vals)}))

    pcols = {c['name'] for c in sa.inspect(conn).get_columns('forecast_periods')}
    present = [c for c in FLIP_PERIOD_COLS if c in pcols]
    if present:
        sets = ", ".join(f"{c} = -{c}" for c in present)
        conn.execute(sa.text(f"UPDATE forecast_periods SET {sets}"))


def upgrade() -> None:
    _flip(+1)


def downgrade() -> None:
    # Flipping is its own inverse.
    _flip(-1)
