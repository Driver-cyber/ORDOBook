"""Annual-target derivation — the single source of truth.

Everything the Targets page shows that isn't typed in — Revenue, Gross Profit,
Net Cash Flow, the projected balance sheet and its subtotals, the summary P&L —
is derived HERE from the stored driver targets, and the Scoreboard grades
against this same derivation. Nothing derived is persisted, so a formula change
can never leave a stale copy behind on another screen.

All money is int cents; counts and days are ints. Sign conventions:
  - owner_total_draws and the cf_* drivers are SIGNED cash amounts: a draw,
    purchase or repayment is negative (it reduces cash).
  - cf_assets_change / cf_liabilities_change are positive-favourable.
  - Net CF = Net Profit + Owner Investments/(Draws) + CF Assets + CF Liabilities.
"""
import math

DRIVER_KEYS = (
    "total_jobs", "blended_avg_job_value", "cost_of_sales", "payroll_expenses",
    "marketing_expenses", "overhead_expenses", "other_income_expense",
    "dso_days", "dio_days", "dpo_days", "owner_total_draws",
    "cf_other_current_assets", "cf_fixed_assets", "cf_current_debt", "cf_long_term_debt",
)

# Keys that are derived and must never be stored as targets.
COMPUTED_KEYS = frozenset({
    "revenue", "gross_profit", "net_operating_profit", "net_profit",
    "cf_assets_change", "cf_liabilities_change", "net_cash_flow",
})


def _js_round(x: float) -> int:
    """Match JavaScript Math.round (half toward +inf) so the port is exact."""
    return int(math.floor(x + 0.5))


def compute_target_derived(drivers: dict, prior_ending: dict | None) -> dict:
    d = {k: int(drivers.get(k) or 0) for k in DRIVER_KEYS}
    p = prior_ending or {}
    pe = lambda k: int(p.get(k) or 0)

    # --- P&L ---
    revenue = d["total_jobs"] * d["blended_avg_job_value"]
    cos = d["cost_of_sales"]
    gross_profit = revenue - cos
    payroll, marketing, overhead = d["payroll_expenses"], d["marketing_expenses"], d["overhead_expenses"]
    net_op_profit = gross_profit - payroll - marketing - overhead
    other_ie = d["other_income_expense"]
    net_profit = net_op_profit + other_ie

    # --- prior year ending balances ---
    prior_ar, prior_inv, prior_ap = pe("accounts_receivable"), pe("inventory"), pe("accounts_payable")
    prior_cash, prior_equity = pe("cash"), pe("equity")
    prior_other_ca, prior_fixed = pe("other_current_assets"), pe("total_fixed_assets")
    prior_other_lta = pe("total_other_long_term_assets")
    prior_other_cl, prior_ltl = pe("other_current_liabilities"), pe("total_long_term_liabilities")

    # --- working capital targets (annual rate -> daily x days outstanding) ---
    dso, dio, dpo = d["dso_days"], d["dio_days"], d["dpo_days"]
    target_ar  = _js_round(revenue / 365 * dso) if (dso > 0 and revenue > 0) else prior_ar
    target_inv = _js_round(cos / 365 * dio)     if (dio > 0 and cos > 0)     else prior_inv
    target_ap  = _js_round(cos / 365 * dpo)     if (dpo > 0 and cos > 0)     else prior_ap

    ar_change, inv_change, ap_change = target_ar - prior_ar, target_inv - prior_inv, target_ap - prior_ap

    # --- cash flow ---
    owner = d["owner_total_draws"]
    cf_other_ca, cf_fixed = d["cf_other_current_assets"], d["cf_fixed_assets"]
    cf_cur_debt, cf_lt_debt = d["cf_current_debt"], d["cf_long_term_debt"]
    cf_assets_change = -(ar_change + inv_change) + cf_other_ca + cf_fixed
    cf_liabilities_change = ap_change + cf_cur_debt + cf_lt_debt
    net_cash_flow = net_profit + owner + cf_assets_change + cf_liabilities_change

    # --- projected balance sheet (balance moves mirror the cash moves) ---
    projected_cash = prior_cash + net_cash_flow
    proj_other_ca = prior_other_ca - cf_other_ca
    proj_fixed = max(0, prior_fixed - cf_fixed)
    proj_other_lta = prior_other_lta
    proj_other_cl = prior_other_cl + cf_cur_debt
    proj_ltl = prior_ltl + cf_lt_debt
    projected_equity = prior_equity + net_profit + owner

    total_current_assets = projected_cash + target_ar + target_inv + proj_other_ca
    total_assets = total_current_assets + proj_fixed + proj_other_lta
    total_current_liabilities = target_ap + proj_other_cl
    total_liabilities = total_current_liabilities + proj_ltl
    total_liabilities_equity = total_liabilities + projected_equity

    return {
        "revenue": revenue, "cost_of_sales": cos, "gross_profit": gross_profit,
        "net_operating_profit": net_op_profit, "net_profit": net_profit,
        "cf_assets_change": cf_assets_change, "cf_liabilities_change": cf_liabilities_change,
        "net_cash_flow": net_cash_flow,
        "target_ar": target_ar, "target_inventory": target_inv, "target_ap": target_ap,
        "projected_cash": projected_cash, "projected_equity": projected_equity,
        "proj_other_current_assets": proj_other_ca, "proj_fixed_assets": proj_fixed,
        "proj_other_long_term_assets": proj_other_lta,
        "proj_other_current_liabilities": proj_other_cl, "proj_long_term_liabilities": proj_ltl,
        "total_current_assets": total_current_assets, "total_assets": total_assets,
        "total_current_liabilities": total_current_liabilities, "total_liabilities": total_liabilities,
        "total_liabilities_equity": total_liabilities_equity,
        "total_operating_expenses": payroll + marketing + overhead,
        "other_income_expense": other_ie,
        "prior_cash": prior_cash, "prior_ar": prior_ar, "prior_inventory": prior_inv,
        "prior_ap": prior_ap, "prior_equity": prior_equity,
        "prior_other_current_assets": prior_other_ca, "prior_fixed_assets": prior_fixed,
        "prior_other_long_term_assets": prior_other_lta,
        "prior_other_current_liabilities": prior_other_cl, "prior_long_term_liabilities": prior_ltl,
        "prior_total_current_assets": prior_cash + prior_ar + prior_inv + prior_other_ca,
        "prior_total_assets": prior_cash + prior_ar + prior_inv + prior_other_ca + prior_fixed + prior_other_lta,
        "prior_total_current_liabilities": prior_ap + prior_other_cl,
        "prior_total_liabilities": prior_ap + prior_other_cl + prior_ltl,
        "prior_total_liabilities_equity": prior_ap + prior_other_cl + prior_ltl + prior_equity,
    }
