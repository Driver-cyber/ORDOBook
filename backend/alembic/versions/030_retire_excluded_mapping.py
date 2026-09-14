"""retire the "Excluded" mapping — every account carries a real category

"Excluded" never excluded anything. Overhead was a plug (QB's Total Expenses less
payroll, marketing and depreciation — migration 020), so an excluded P&L account's
dollars still flowed into overhead while its name was hidden from view. The same
plug double-counted any expense-section account mapped to Cost of Sales, and
dropped any COGS-section account mapped to Overhead.

Overhead is now the direct sum of the accounts mapped to it, which only works if
nothing can be excluded. This migration gives every excluded account a real
category, chosen from the statement section it was parsed from — so an excluded
expense-section account becomes Overhead, which is exactly where the plug was
already putting its dollars. No stored figure changes here.

Stored monthly totals are NOT recomputed by this migration. They are a snapshot
taken at import time, and re-deriving them can move a month's net profit (that is
the point — the double-count goes away). The advisor runs that deliberately from
Workspace → Actuals → "Re-apply Mapping", which reports every month that moved
and by how much.

Revision ID: 030
Revises: 029
Create Date: 2026-09-14
"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '030'
down_revision: Union[str, None] = '029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of the auto-mapper's context defaults. Deliberately inlined rather
# than imported: a migration has to keep producing the same result years from now,
# whatever app/parsers/auto_mapper.py grows into.
_PL_SUBSECTION = {
    "payroll": "payroll_expenses",
    "marketing": "marketing_expenses",
    "depreciation": "depreciation_amortization",
    "overhead": "overhead_expenses",
}
_PL_SECTION = {
    "income": "revenue",
    "cogs": "cost_of_sales",
    "other_income": "other_income_expense",
    "other_expenses": "other_income_expense",
    "expenses": "overhead_expenses",
}
_BS_SUBSECTION = {
    "bank_accounts": "cash",
    "undeposited": "cash",
    "accounts_receivable": "accounts_receivable",
    "other_current_assets": "other_current_assets",
    "fixed_assets": "total_fixed_assets",
    "other_long_term_assets": "total_other_long_term_assets",
    "accounts_payable": "accounts_payable",
    "credit_cards": "other_current_liabilities",
    "other_current_liabilities": "other_current_liabilities",
    "current_liabilities": "other_current_liabilities",
    "long_term_liabilities": "total_long_term_liabilities",
    "equity": "equity_before_net_profit",
}


def _as_rows(raw):
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    return (raw or {}).get("rows") or []


def upgrade() -> None:
    conn = op.get_bind()

    mappings = sa.table(
        "account_mappings",
        sa.column("id", sa.Integer),
        sa.column("client_id", sa.Integer),
        sa.column("report_type", sa.String),
        sa.column("qb_account_name", sa.String),
        sa.column("ordobook_category", sa.String),
        sa.column("is_excluded", sa.Boolean),
    )
    stale = conn.execute(
        sa.select(mappings.c.id, mappings.c.client_id, mappings.c.report_type,
                  mappings.c.qb_account_name)
        .where(sa.or_(mappings.c.ordobook_category == "excluded",
                      mappings.c.is_excluded == sa.true()))
    ).fetchall()
    if not stale:
        return

    # Where each account sits on the statement, from the audit-trail rows.
    actuals = sa.table("monthly_actuals",
                       sa.column("client_id", sa.Integer),
                       sa.column("raw_data", sa.JSON))
    context: dict[tuple, tuple] = {}
    for client_id, raw in conn.execute(sa.select(actuals.c.client_id, actuals.c.raw_data)):
        for row in _as_rows(raw):
            if row.get("row_type") != "line_item":
                continue
            key = (client_id, row.get("account_name", ""))
            context.setdefault(key, (row.get("section", ""), row.get("subsection", "")))

    for map_id, client_id, report_type, account_name in stale:
        section, subsection = context.get((client_id, account_name), ("", ""))
        if report_type == "balance_sheet" or section in (
            "assets", "liabilities", "liabilities_equity", "equity",
        ):
            category = _BS_SUBSECTION.get(subsection, "other_current_assets")
        elif section == "expenses":
            category = _PL_SUBSECTION.get(subsection, "overhead_expenses")
        else:
            # Unknown section: overhead is where the plug was already counting it.
            category = _PL_SECTION.get(section, "overhead_expenses")

        conn.execute(
            mappings.update().where(mappings.c.id == map_id)
            .values(ordobook_category=category, is_excluded=False)
        )


def downgrade() -> None:
    # Which accounts were excluded is not recorded once they carry a real category,
    # and "excluded" is no longer a category the app offers. Nothing to restore.
    pass
