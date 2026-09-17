"""an account mapping is identified by its statement SECTION as well as its name

The bug this fixes (found by audit 2026-09-16, reproduced against the real code
path): two accounts with the same name in different sections of the SAME statement
collapsed into one mapping.

`suggest_mappings` looked a saved mapping up by (report_type, qb_account_name), and
the unique constraint was (client_id, report_type, qb_account_name) — so "Supplies"
under COGS and "Supplies" under Expenses could not hold different categories:

    no saved mapping:                cost_of_sales 100.00 | overhead  50.00
    after mapping the overhead row:  cost_of_sales   0.00 | overhead 150.00

Cost of Sales silently empties into Overhead. The QuickBooks net-income tie-out
CANNOT catch it — COS and overhead both reduce net profit equally, so net profit
still ties while gross profit and every margin are wrong.

This is the other half of the 2026-09-14 "an account name is not a key" lesson.
That fix made RESOLUTION positional, which fixed the Balance-Sheet-vs-P&L case
(those carry different report_types). Two sections of one statement carry the same
report_type, so they needed the section in the key itself.

The backfill reads each client's stored `raw_data.rows` — the same audit-trail rows
Re-apply Mapping replays — to learn which section(s) each mapped account appeared
in. Where one name appears in several sections, one row is written per section,
each keeping today's category: behaviour is IDENTICAL the moment this lands, and
splitting the two becomes possible rather than automatic.

Rows that cannot be backfilled (the account is no longer in any stored import) keep
section='' and go on working as a legacy catch-all, because the lookup in
auto_mapper falls back to ('', name). They heal themselves on the next confirm.
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '032'
down_revision: Union[str, None] = '031'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_UQ = "uq_account_mappings_client_report_account"
_NEW_UQ = "uq_account_mappings_client_report_section_account"

# Which statement a parsed section belongs to. Mirrors auto_mapper._infer_report_type.
_PL_SECTIONS = {"income", "cogs", "expenses", "other_income", "other_expenses"}
_BS_SECTIONS = {"assets", "liabilities", "liabilities_equity", "equity"}


def _report_type(section: str) -> str:
    if section in _PL_SECTIONS:
        return "profit_and_loss"
    if section in _BS_SECTIONS:
        return "balance_sheet"
    return "unknown"


def _as_json(value):
    """raw_data as a dict, whatever the driver handed back.

    A sa.text() SELECT carries no column type, so SQLAlchemy does not deserialize
    the JSON column — SQLite returns the raw string, psycopg2 returns a dict. Both
    are normal; guessing wrong here silently skipped every row on SQLite.
    """
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, dict) else {}


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _constraint_names(inspector, table: str) -> set:
    return {c["name"] for c in inspector.get_unique_constraints(table)}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "account_mappings" not in inspector.get_table_names():
        return

    # ── 1. add the column (idempotent) ───────────────────────────────────────
    if not _has_column(inspector, "account_mappings", "section"):
        op.add_column(
            "account_mappings",
            sa.Column("section", sa.String(50), nullable=False, server_default=""),
        )
        inspector = sa.inspect(conn)

    # ── 2. learn each account's section(s) from the stored audit-trail rows ──
    # {(client_id, report_type, account_name) -> {section, ...}}
    seen: dict[tuple, set] = {}
    for client_id, raw_data in conn.execute(
        sa.text("SELECT client_id, raw_data FROM monthly_actuals")
    ):
        rows = _as_json(raw_data).get("rows") or []
        for row in rows:
            if row.get("row_type") != "line_item":
                continue
            section = row.get("section", "") or ""
            name = row.get("account_name", "") or ""
            if not name:
                continue
            seen.setdefault((client_id, _report_type(section), name), set()).add(section)

    # ── 3. backfill, splitting a name that lives in several sections ────────
    mappings = sa.table(
        "account_mappings",
        sa.column("id", sa.Integer),
        sa.column("client_id", sa.Integer),
        sa.column("report_type", sa.String),
        sa.column("qb_account_name", sa.String),
        sa.column("ordobook_category", sa.String),
        sa.column("section", sa.String),
        sa.column("is_excluded", sa.Boolean),
    )

    existing = list(conn.execute(sa.select(
        mappings.c.id, mappings.c.client_id, mappings.c.report_type,
        mappings.c.qb_account_name, mappings.c.ordobook_category,
    )))

    # Drop the old constraint BEFORE inserting the split rows — they would collide
    # with it (same client/report_type/name, different section).
    #
    # batch_alter_table, because SQLite cannot ALTER a constraint and SQLite is what
    # the packaged app ships with. Batch mode copies the table; on Postgres it
    # degrades to a plain ALTER, so one code path serves both.
    if _OLD_UQ in _constraint_names(inspector, "account_mappings"):
        with op.batch_alter_table("account_mappings") as batch:
            batch.drop_constraint(_OLD_UQ, type_="unique")

    for mid, client_id, report_type, name, category in existing:
        sections = sorted(seen.get((client_id, report_type, name), set()))
        if not sections:
            continue                      # keep section='' — the legacy catch-all
        # The first section stays on the original row; any others are new rows
        # carrying the same category, so nothing moves today.
        conn.execute(
            mappings.update().where(mappings.c.id == mid).values(section=sections[0])
        )
        for extra in sections[1:]:
            conn.execute(mappings.insert().values(
                client_id=client_id,
                report_type=report_type,
                qb_account_name=name,
                ordobook_category=category,
                section=extra,
                is_excluded=False,
            ))

    # ── 4. the new identity ─────────────────────────────────────────────────
    inspector = sa.inspect(conn)
    if _NEW_UQ not in _constraint_names(inspector, "account_mappings"):
        with op.batch_alter_table("account_mappings") as batch:
            batch.create_unique_constraint(
                _NEW_UQ, ["client_id", "report_type", "section", "qb_account_name"],
            )


def downgrade() -> None:
    """Collapse back to (client, report_type, name).

    A name that was split across sections has to lose all but one row, because the
    old constraint cannot hold them. The lowest id wins — that is the row which
    existed before the upgrade, so a straight up/down round trip is lossless.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "account_mappings" not in inspector.get_table_names():
        return

    if _NEW_UQ in _constraint_names(inspector, "account_mappings"):
        with op.batch_alter_table("account_mappings") as batch:
            batch.drop_constraint(_NEW_UQ, type_="unique")

    conn.execute(sa.text("""
        DELETE FROM account_mappings
        WHERE id NOT IN (
            SELECT MIN(id) FROM account_mappings
            GROUP BY client_id, report_type, qb_account_name
        )
    """))

    inspector = sa.inspect(conn)
    with op.batch_alter_table("account_mappings") as batch:
        if _OLD_UQ not in _constraint_names(inspector, "account_mappings"):
            batch.create_unique_constraint(
                _OLD_UQ, ["client_id", "report_type", "qb_account_name"],
            )
        if _has_column(inspector, "account_mappings", "section"):
            batch.drop_column("section")
