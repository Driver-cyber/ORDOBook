"""Direction and identity tests for the Targets derivation (app/engine/targets.py).

Why these exist: the projected balance sheet tied straight through a $190k
owner-draws sign error, because an identity inside one self-consistent model
ties whichever sign convention it uses. What catches a sign error is asserting
the DIRECTION a signed driver moves cash — that a -95,000 draw reduces Net Cash
Flow and equity by 95,000. Run:  python scripts/verify_targets.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.engine.targets import compute_target_derived as D

PRIOR = {  # balanced: assets 200,000 = liabilities 120,000 + equity 80,000 (cents)
    "cash": 5_000_000, "accounts_receivable": 2_000_000, "inventory": 1_000_000,
    "other_current_assets": 500_000, "total_fixed_assets": 10_000_000,
    "total_other_long_term_assets": 1_500_000, "accounts_payable": 3_000_000,
    "other_current_liabilities": 2_000_000, "total_long_term_liabilities": 7_000_000,
    "equity": 8_000_000,
}
BASE = {  # the on-screen targets: 255 jobs x $2,200, COS 196,350, payroll 130,000, overhead 80,000, other -2,500
    "total_jobs": 255, "blended_avg_job_value": 220_000, "cost_of_sales": 19_635_000,
    "payroll_expenses": 13_000_000, "marketing_expenses": 0, "overhead_expenses": 8_000_000,
    "other_income_expense": -250_000, "dso_days": 0, "dio_days": 0, "dpo_days": 0,
    "owner_total_draws": 0, "cf_other_current_assets": 0, "cf_fixed_assets": 0,
    "cf_current_debt": 0, "cf_long_term_debt": 0,
}
fails = []
def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))
    if not cond: fails.append(name)

base = D(BASE, PRIOR)
check("net profit = 152,150 from the on-screen drivers", base["net_profit"] == 15_215_000, base["net_profit"])

def delta(key, amount, out):
    return D({**BASE, key: amount}, PRIOR)[out] - base[out]

print("Direction — a signed driver must move cash the way its sign says:")
check("a -95,000 owner draw REDUCES Net Cash Flow by 95,000",   delta("owner_total_draws", -9_500_000, "net_cash_flow") == -9_500_000)
check("a -95,000 owner draw REDUCES projected equity by 95,000", delta("owner_total_draws", -9_500_000, "projected_equity") == -9_500_000)
check("a +10,000 owner investment RAISES Net Cash Flow by 10,000", delta("owner_total_draws", 1_000_000, "net_cash_flow") == 1_000_000)
check("a -5,751 fixed-asset purchase REDUCES Net Cash Flow by 5,751", delta("cf_fixed_assets", -575_100, "net_cash_flow") == -575_100)
check("a -5,751 fixed-asset purchase RAISES fixed assets by 5,751",  delta("cf_fixed_assets", -575_100, "proj_fixed_assets") == 575_100)
check("a -5,000 debt repayment REDUCES Net Cash Flow by 5,000",     delta("cf_long_term_debt", -500_000, "net_cash_flow") == -500_000)
check("a -5,000 debt repayment REDUCES long-term debt by 5,000",    delta("cf_long_term_debt", -500_000, "proj_long_term_liabilities") == -500_000)
check("a +167 current-debt addition RAISES Net Cash Flow by 167",   delta("cf_current_debt", 16_700, "net_cash_flow") == 16_700)
check("a -2,000 other-current-asset purchase REDUCES cash, RAISES the asset",
      delta("cf_other_current_assets", -200_000, "net_cash_flow") == -200_000
      and delta("cf_other_current_assets", -200_000, "proj_other_current_assets") == 200_000)

print("Hand-computed case (no working-capital days, so CF changes are the drivers alone):")
full = D({**BASE, "owner_total_draws": -9_500_000, "cf_other_current_assets": -200_000,
          "cf_fixed_assets": -575_100, "cf_current_debt": 16_700, "cf_long_term_debt": -500_000}, PRIOR)
# NCF = 152,150 - 95,000 + (-2,000 - 5,751) + (167 - 5,000) = 44,566
check("Net Cash Flow = 44,566", full["net_cash_flow"] == 4_456_600, full["net_cash_flow"])
check("Net CF identity: NP + owner + CF assets + CF liabilities",
      full["net_cash_flow"] == full["net_profit"] + (-9_500_000) + full["cf_assets_change"] + full["cf_liabilities_change"])

print("Balance sheet:")
check("ties when the prior balance sheet ties", full["total_liabilities_equity"] == full["total_assets"])
off = D(full and {**BASE, "owner_total_draws": -9_500_000}, {**PRIOR, "equity": PRIOR["equity"] + 123_400})
check("surfaces a prior-year imbalance to the dollar (1,234 off)",
      off["total_liabilities_equity"] - off["total_assets"] == 123_400)

print("Working capital:")
wc = D({**BASE, "dso_days": 4, "dpo_days": 18}, PRIOR)
check("AR target = revenue/365 x DSO", wc["target_ar"] == round(56_100_000 / 365 * 4 + 1e-9))
check("AP target = COS/365 x DPO",     wc["target_ap"] == round(19_635_000 / 365 * 18 + 1e-9))

print()
print("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(0 if not fails else 1)
