"""
Auto-mapper: suggests ORDOBOOK category for each parsed QB account row.

Uses section/subsection context from the parser as the primary signal,
with keyword overrides for known special cases.

Never writes to the DB — returns suggestions only.
"""

# Which statement a parsed section belongs to. Single source of truth — these sets
# were previously spelled out four times across two modules.
PL_SECTIONS = frozenset(["income", "cogs", "expenses", "other_income", "other_expenses"])
BS_SECTIONS = frozenset(["assets", "liabilities", "liabilities_equity", "equity"])

# Valid ORDOBOOK categories
VALID_CATEGORIES = frozenset([
    # Income Statement
    "revenue",
    "cost_of_sales",
    "payroll_expenses",
    "marketing_expenses",
    "depreciation_amortization",
    "overhead_expenses",
    "other_income_expense",
    # Balance Sheet
    "cash",
    "accounts_receivable",
    "inventory",
    "other_current_assets",
    "total_fixed_assets",
    "total_other_long_term_assets",
    "accounts_payable",
    "other_current_liabilities",
    "total_long_term_liabilities",
    "equity_before_net_profit",
    "owner_distributions",   # signed YTD owner activity: draws negative, investments positive
    "net_profit_for_year",
])

# "excluded" was retired 2026-09-14 (migration 030). It never excluded anything:
# an excluded P&L account's dollars still reached overhead through the plug, while
# its name was hidden from the schedule. Every account now carries a real category.
# A saved mapping naming a retired category is ignored below and re-suggested from
# context, so a database that predates the migration heals itself on the next review.
RETIRED_CATEGORIES = frozenset(["excluded"])

# P&L: section → default category
_PL_SECTION_MAP = {
    "income": "revenue",
    "cogs": "cost_of_sales",
    "other_income": "other_income_expense",
    "other_expenses": "other_income_expense",
}

# P&L: subsection → category (overrides section default within "expenses")
_PL_SUBSECTION_MAP = {
    "payroll": "payroll_expenses",
    "marketing": "marketing_expenses",
    "depreciation": "depreciation_amortization",
    "overhead": "overhead_expenses",
}

# Balance Sheet: subsection → category
_BS_SUBSECTION_MAP = {
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

# Which statement each category can legitimately belong to. A keyword override is
# only allowed to produce a category that belongs to the row's own statement.
#
# Without this guard, "Payroll Taxes Payable" — a stock QuickBooks CURRENT
# LIABILITY — matched the "payroll tax" keyword and mapped to payroll_expenses at
# HIGH confidence, so needs_review was false and Review Mapping never flagged it.
# A liability balance would be added to monthly payroll expense. Same shape for
# "Prepaid Advertising" (an other current asset) via the "advertising" keyword.
# (Audit 2026-09-16; latent on the first client's chart of accounts.)
_PL_CATEGORIES = frozenset([
    "revenue", "cost_of_sales", "payroll_expenses", "marketing_expenses",
    "depreciation_amortization", "overhead_expenses", "other_income_expense",
])
_BS_CATEGORIES = frozenset(VALID_CATEGORIES - _PL_CATEGORIES)


def _category_fits_statement(category: str, report_type: str) -> bool:
    if report_type == "profit_and_loss":
        return category in _PL_CATEGORIES
    if report_type == "balance_sheet":
        return category in _BS_CATEGORIES
    return True          # unknown statement — don't block, the row is flagged anyway


# A row whose section/subsection says nothing still has to land somewhere. Land it
# in the right STATEMENT: dropping a balance onto overhead_expenses (a P&L
# category), if confirmed unread, puts a balance-sheet figure into expenses.
_UNKNOWN_FALLBACK = {
    "assets": "other_current_assets",
    "liabilities": "other_current_liabilities",
    "liabilities_equity": "other_current_liabilities",
    "equity": "equity_before_net_profit",
}
_UNKNOWN_FALLBACK_PL = "overhead_expenses"

# Keyword overrides — applied after section/subsection logic
# These fire regardless of section context when the account name matches
_KEYWORD_OVERRIDES = [
    # Payroll-related accounts that may appear outside the Payroll sub-section
    (["payroll tax", "payroll fee", "payroll service"], "payroll_expenses"),
    # Depreciation/amortization
    (["depreciation", "amortization"], "depreciation_amortization"),
    # Undeposited funds / payments to deposit → cash
    (["undeposited funds", "payments to deposit", "undeposited"], "cash"),
    # Net income under equity section
    (["net income", "net profit"], "net_profit_for_year"),
    # Advertising/marketing accounts that may land in overhead by default
    (["advertising", "marketing"], "marketing_expenses"),
]

# Owner activity accounts inside the Balance Sheet equity section. Only checked
# there — "contribution" and "distribution" also appear in P&L account names
# (retirement contributions, distribution costs) where they mean something else.
_OWNER_ACTIVITY_KEYWORDS = [
    "distribution", "draw", "contribution", "investment",
    "shareholder", "partner", "member",
]


def _keyword_override(account_name: str, section: str) -> str | None:
    """Check keyword overrides. Returns category or None."""
    name_lower = account_name.lower()

    # "Net Income" / "Net Profit" under equity → net_profit_for_year
    # (The same names in the P&L are skipped by the parser as subtotals,
    #  so this only fires for the Balance Sheet equity section.)
    if section == "equity" and ("net income" in name_lower or "net profit" in name_lower):
        return "net_profit_for_year"

    # Owner draws / distributions / contributions under equity → owner_distributions
    if section == "equity" and any(kw in name_lower for kw in _OWNER_ACTIVITY_KEYWORDS):
        return "owner_distributions"

    report_type = _infer_report_type(section)
    for keywords, category in _KEYWORD_OVERRIDES:
        if not any(kw in name_lower for kw in keywords):
            continue
        # A keyword may never carry a row across statements. This subsumes the two
        # guards that used to be spelled out here by hand: "Accumulated
        # Depreciation" in Fixed Assets stays on the balance sheet, and
        # net_profit_for_year only reaches an equity row.
        if not _category_fits_statement(category, report_type):
            continue
        if category == "net_profit_for_year" and section != "equity":
            continue
        return category

    return None


def suggest_mappings(
    parsed_rows: list[dict],
    existing_mappings: dict[tuple, str],  # {(report_type, qb_account_name): ordobook_category}
) -> list[dict]:
    """
    For each parsed line_item row, suggest an ORDOBOOK category.

    Args:
        parsed_rows: the "rows" list from qb_parser.parse_file()
        existing_mappings: saved mappings for this client from the DB
            {(report_type, qb_account_name): ordobook_category}

    Returns:
        list of {
            "qb_account_name": str,
            "report_type": str,
            "suggested_category": str,
            "confidence": "saved" | "high" | "low",
            "needs_review": bool
        }
    """
    suggestions = []

    for row in parsed_rows:
        if row.get("row_type") != "line_item":
            continue

        account_name = row["account_name"]
        section = row.get("section", "")
        subsection = row.get("subsection", "")
        report_type = _infer_report_type(section)

        # 1. Use the saved mapping if there is one — unless it names a retired
        #    category, in which case fall through and re-derive it from context.
        #
        #    Two-tier lookup. The section is part of a mapping's identity (032),
        #    because the same name legitimately owns a row in two sections of one
        #    statement — "Supplies" under COGS and under Expenses are different
        #    accounts, and keying by name alone silently drained one into the other.
        #    The ('', name) fallback carries mappings that migration 032 could not
        #    backfill; they heal on the next confirm.
        saved = _saved_category(existing_mappings, report_type, section, account_name)
        if saved is not None:
            suggestions.append({
                "qb_account_name": account_name,
                "report_type": report_type,
                "suggested_category": saved,
                "confidence": "saved",
                "needs_review": False,
            })
            continue

        # 2. Check keyword overrides
        override = _keyword_override(account_name, section)
        if override:
            suggestions.append({
                "qb_account_name": account_name,
                "report_type": report_type,
                "suggested_category": override,
                "confidence": "high",
                "needs_review": False,
            })
            continue

        # 3. Use section/subsection context
        category = _category_from_context(section, subsection, report_type)
        if category:
            confidence = _confidence(section, subsection, report_type)
            suggestions.append({
                "qb_account_name": account_name,
                "report_type": report_type,
                "suggested_category": category,
                "confidence": confidence,
                "needs_review": confidence == "low",
            })
        else:
            # Unknown — flag for review, but land it in the right STATEMENT.
            suggestions.append({
                "qb_account_name": account_name,
                "report_type": report_type,
                "suggested_category": _UNKNOWN_FALLBACK.get(section, _UNKNOWN_FALLBACK_PL),
                "confidence": "low",
                "needs_review": True,
            })

    return suggestions


def _saved_category(existing_mappings: dict, report_type: str, section: str,
                    account_name: str) -> str | None:
    """The saved category for this row, or None to fall through to context.

    Tries the section-qualified key first, then the legacy ('', name) key. A saved
    mapping naming a retired category is ignored at both tiers, so a database that
    predates migration 030 re-derives instead of trusting a dead value.
    """
    for key in ((report_type, section, account_name),      # 032 identity
                (report_type, "", account_name)):          # pre-032 catch-all
        category = existing_mappings.get(key)
        if category in VALID_CATEGORIES:
            return category
    return None


def _confidence(section: str, subsection: str, report_type: str) -> str:
    """Return 'high' or 'low' confidence for a context-based mapping."""
    if report_type == "profit_and_loss":
        if section in _PL_SECTION_MAP:
            return "high"
        if section == "expenses" and subsection in _PL_SUBSECTION_MAP:
            return "high"
        return "low"
    if report_type == "balance_sheet":
        return "high" if subsection in _BS_SUBSECTION_MAP else "low"
    return "low"


def _infer_report_type(section: str) -> str:
    if section in PL_SECTIONS:
        return "profit_and_loss"
    if section in BS_SECTIONS:
        return "balance_sheet"
    return "unknown"


def _category_from_context(section: str, subsection: str, report_type: str) -> str | None:
    if report_type == "profit_and_loss":
        # Direct section mapping
        if section in _PL_SECTION_MAP:
            return _PL_SECTION_MAP[section]
        # Expenses section — use subsection
        if section == "expenses":
            return _PL_SUBSECTION_MAP.get(subsection, "overhead_expenses")
        return None

    if report_type == "balance_sheet":
        if subsection in _BS_SUBSECTION_MAP:
            return _BS_SUBSECTION_MAP[subsection]
        return None

    return None
