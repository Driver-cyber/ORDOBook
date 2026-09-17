"""Turn parsed QuickBooks account rows + a client's mapping into category totals.

**The rule (2026-09-14, replacing the plug):** every line-item account belongs to
exactly one ORDOBOOK category, and each category is the DIRECT SUM of the accounts
mapped to it — whatever section of the statement the account came from.

    total_expenses = payroll + marketing + depreciation + overhead

Overhead used to be a plug: QB's "Total Expenses" subtotal less the three named
buckets. That guaranteed net profit tied to QB's net income no matter how accounts
were mapped, but it had two costs:

  * an account mapped to Cost of Sales was counted TWICE — once in COS, and again
    inside the plug, because it was still in QB's expense-section subtotal;
  * an account from the COGS section mapped to Overhead vanished from the P&L
    entirely — removed from COS, never picked up by the expense-section plug;
  * "Excluded" excluded nothing: the account name was hidden while its dollars
    still flowed into the plug.

With "Excluded" retired and every account mapped, the direct sum ties to QB's net
income by construction (every P&L dollar is counted exactly once) AND can be
audited line by line — which is what the Overhead schedule drills into.

This module is the single source of truth for what gets STORED. MappingReview's
browser-side preview mirrors it for live feedback while the advisor reassigns
accounts, but the server recomputes from the raw rows at confirm time and the
server's answer is what lands in the database.
"""
from app.parsers.auto_mapper import suggest_mappings

# P&L categories that make up QB's operating-expense block.
OPEX_CATEGORIES = (
    "payroll_expenses",
    "marketing_expenses",
    "depreciation_amortization",
    "overhead_expenses",
)


def resolve_categories(raw_rows: list[dict], existing_mappings: dict) -> dict:
    """Category for every line-item row, keyed (section, account_name).

    Saved mappings win; anything unmapped falls back to the auto-mapper's
    section/keyword suggestion, so a newly-seen account still lands somewhere
    sensible instead of silently scoring zero.

    Rows are matched to suggestions POSITIONALLY, not by account name.
    `suggest_mappings` emits exactly one suggestion per line-item row, in row
    order, and the same name legitimately appears on both statements — a vehicle
    is a fixed asset on the Balance Sheet and an expense account on the P&L.
    Keying by name alone let one row's category overwrite the other's, and the
    loser's dollars silently left its category. (Found on real data 2026-09-14:
    two vehicle accounts vanished from Overhead.)
    """
    line_items = [r for r in raw_rows if r.get("row_type") == "line_item"]
    suggestions = suggest_mappings(raw_rows, existing_mappings)
    if len(suggestions) != len(line_items):   # invariant broken — refuse to guess
        raise ValueError(
            f"auto-mapper returned {len(suggestions)} suggestions for "
            f"{len(line_items)} line-item rows"
        )

    resolved = {}
    for row, suggestion in zip(line_items, suggestions):
        resolved[(row.get("section", ""), row.get("account_name", ""))] = \
            suggestion["suggested_category"]
    return resolved


def _signed(category: str, section: str, value: int) -> int:
    """QB prints "Other Expenses" as positive figures, but they reduce net profit.
    Store them negative so other_income_expense reads as a net."""
    if category == "other_income_expense" and section == "other_expenses":
        return -value
    return value


def compute_period_totals(raw_rows: list[dict], existing_mappings: dict) -> dict:
    """{period label → {category → cents}} for every period present in the rows."""
    resolved = resolve_categories(raw_rows, existing_mappings)

    periods: set[str] = set()
    for row in raw_rows:
        if row.get("row_type") == "line_item" and isinstance(row.get("values"), dict):
            periods.update(row["values"].keys())

    totals: dict[str, dict[str, int]] = {}
    for period in periods:
        cats: dict[str, int] = {}
        for row in raw_rows:
            if row.get("row_type") != "line_item":
                continue
            section = row.get("section", "")
            category = resolved.get((section, row.get("account_name", "")))
            if not category:
                continue
            value = (row.get("values") or {}).get(period, 0) or 0
            cats[category] = cats.get(category, 0) + _signed(category, section, value)

        # Derived roll-up, never mapped to directly.
        cats["total_expenses"] = sum(cats.get(c, 0) for c in OPEX_CATEGORIES)
        totals[period] = cats
    return totals


def category_accounts(raw_rows: list[dict], existing_mappings: dict, category: str) -> list[dict]:
    """Every account mapped to `category`, with its per-period amounts.

    Powers the Overhead schedule: the accounts behind one line, in the order they
    appeared on the statement, each carrying the full period history so the screen
    can show this month, last month and a year-to-date average without a second
    round trip.
    """
    resolved = resolve_categories(raw_rows, existing_mappings)

    accounts = []
    for row in raw_rows:
        if row.get("row_type") != "line_item":
            continue
        section = row.get("section", "")
        name = row.get("account_name", "")
        if resolved.get((section, name)) != category:
            continue
        values = {k: _signed(category, section, v or 0) for k, v in (row.get("values") or {}).items()}
        accounts.append({
            "account_name": name,
            "section": section,
            # An account mapped here from another statement section is worth
            # showing — usually a deliberate reclass, occasionally a mapping slip.
            "from_other_section": section not in ("expenses",) and category in OPEX_CATEGORIES,
            "values": values,
        })
    return accounts
