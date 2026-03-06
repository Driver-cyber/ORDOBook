"""
Auto-mapper: suggests ORDOBOOK category for each parsed QB account row.

Uses section/subsection context from the parser as the primary signal,
with keyword overrides for known special cases.

Never writes to the DB — returns suggestions only.
"""

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
    "net_profit_for_year",
    # Special
    "excluded",
])

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


def _keyword_override(account_name: str, section: str) -> str | None:
    """Check keyword overrides. Returns category or None."""
    name_lower = account_name.lower()

    # "Net Income" / "Net Profit" under equity → net_profit_for_year
    # (The same names in the P&L are skipped by the parser as subtotals,
    #  so this only fires for the Balance Sheet equity section.)
    if section == "equity" and ("net income" in name_lower or "net profit" in name_lower):
        return "net_profit_for_year"

    _BS_SECTIONS = {"assets", "liabilities", "liabilities_equity", "equity"}

    for keywords, category in _KEYWORD_OVERRIDES:
        if any(kw in name_lower for kw in keywords):
            # "net_profit_for_year" only applies in BS equity section
            if category == "net_profit_for_year" and section != "equity":
                continue
            # "depreciation_amortization" is a P&L category — don't apply to BS accounts
            # (e.g. "Accumulated Depreciation" in Fixed Assets maps to total_fixed_assets)
            if category == "depreciation_amortization" and section in _BS_SECTIONS:
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

        lookup_key = (report_type, account_name)

        # 1. Use saved mapping if available
        if lookup_key in existing_mappings:
            suggestions.append({
                "qb_account_name": account_name,
                "report_type": report_type,
                "suggested_category": existing_mappings[lookup_key],
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
            # Unknown — flag for review
            suggestions.append({
                "qb_account_name": account_name,
                "report_type": report_type,
                "suggested_category": "overhead_expenses",
                "confidence": "low",
                "needs_review": True,
            })

    return suggestions


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
    pl_sections = {"income", "cogs", "expenses", "other_income", "other_expenses"}
    bs_sections = {"assets", "liabilities", "liabilities_equity", "equity"}
    if section in pl_sections:
        return "profit_and_loss"
    if section in bs_sections:
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
