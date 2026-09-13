"""Direction tests for the signed-cash cash-flow lines derived from actuals
(migrations 026 and 029).

Every cash-flow line the engine stores is SIGNED CASH: positive adds cash,
negative uses it. For actuals months:
  - owner draws come from QB's signed YTD equity balance (draws negative,
    reset each fiscal year): the month's line is the change in that balance;
  - capex is -(Δ net fixed assets + depreciation): a purchase is negative;
  - other-current-asset change is -(Δ balance): the asset growing is negative.
The Targets prior-year column reads the year-end owner balance directly.
These checks assert the DIRECTION each piece moves, which is what catches a
sign error. Run:  python scripts/verify_owner_draws.py
"""
import os, sys
from types import SimpleNamespace
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.engine.forecast import build_forecast_period
from app.routers.targets import _aggregate_actuals, _total_equity, _get_metric_value

fails = []
def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))
    if not cond: fails.append(name)

ACTUALS = {  # one confirmed month, cents
    "revenue": 5_000_000, "cost_of_sales": 2_000_000, "payroll_expenses": 1_000_000,
    "marketing_expenses": 100_000, "depreciation_amortization": 50_000,
    "overhead_expenses": 850_000, "total_expenses": 2_000_000, "other_income_expense": 0,
    "cash": 3_000_000, "accounts_receivable": 1_000_000, "inventory": 0,
    "other_current_assets": 0, "total_fixed_assets": 2_000_000,
    "total_other_long_term_assets": 0, "accounts_payable": 500_000,
    "other_current_liabilities": 0, "total_long_term_liabilities": 1_000_000,
    "job_count": 10, "owner_distributions": 0,
}
PRIOR = {  # prior month balances equal this month's, so every delta is 0
    "projected_ar": 1_000_000, "projected_inventory": 0, "projected_ap": 500_000,
    "projected_other_current_assets": 0, "projected_current_debt": 0,
    "projected_long_term_debt": 1_000_000, "projected_fixed_assets": 2_000_000 + 50_000,
    "owner_distributions_balance": 0,
}

def run(**over):
    a = {**ACTUALS}; p = {**PRIOR}
    for k, v in over.items():
        (p if k in PRIOR else a)[k] = v
    return build_forecast_period(month=3, config={}, actuals=a, prior_projected=p)

base = run()
check("no activity: net cash = net profit", base["net_cash_flow"] == base["net_profit"],
      (base["net_cash_flow"], base["net_profit"]))

print("Owner draws — signed cash from the change in the QB balance:")
jan = run(owner_distributions=-9_500_000)
check("a -95,000 YTD balance in the first month is a -95,000 line", jan["owner_distributions"] == -9_500_000, jan["owner_distributions"])
check("it REDUCES net cash by 95,000", base["net_cash_flow"] - jan["net_cash_flow"] == 9_500_000)
check("owner_total_draws carries the same signed amount", jan["owner_total_draws"] == -9_500_000)
feb = run(owner_distributions=-12_000_000, owner_distributions_balance=-9_500_000)
check("balance -95,000 → -120,000 is a -25,000 line that month", feb["owner_distributions"] == -2_500_000, feb["owner_distributions"])
inv = run(owner_distributions=-8_500_000, owner_distributions_balance=-9_500_000)
check("balance -95,000 → -85,000 is a +10,000 investment that RAISES net cash", inv["owner_distributions"] == 1_000_000 and inv["net_cash_flow"] - base["net_cash_flow"] == 1_000_000)

print("Capex — signed cash from the fixed-asset movement:")
buy = run(total_fixed_assets=2_000_000 + 12_600)     # net fixed assets up 126 vs the base month
check("net fixed assets up 126 (after depreciation) is a -126 purchase", buy["capex"] == -12_600, buy["capex"])
check("it REDUCES net cash by 126", base["net_cash_flow"] - buy["net_cash_flow"] == 12_600)
check("it RAISES projected fixed assets to the imported balance", buy["projected_fixed_assets"] == 2_012_600)

print("Other current assets — signed cash:")
oca = run(other_current_assets=200_000)
check("balance growing 2,000 is a -2,000 line that REDUCES net cash",
      oca["other_current_assets_change"] == -200_000 and base["net_cash_flow"] - oca["net_cash_flow"] == 200_000)

print("Forecast branch — the section sums straight down:")
cfg = {"owner_distributions": {"3": -500_000}, "capex_monthly": {"3": -300_000},
       "other_current_assets_change_monthly": {"3": -100_000},
       "current_debt_change_monthly": {"3": 40_000}, "long_term_debt_change_monthly": {"3": -20_000}}
f = build_forecast_period(month=3, config=cfg, actuals=None, prior_projected=PRIOR)
lines = (f["owner_distributions"] + f["capex"] + f["other_current_assets_change"]
         + f["current_debt_change"] + f["long_term_debt_change"]
         - f["ar_change"] - f["inventory_change"] + f["ap_change"])
check("net cash = net profit + every signed line", f["net_cash_flow"] == f["net_profit"] + lines, (f["net_cash_flow"], f["net_profit"], lines))
check("a -3,000 capex RAISES projected fixed assets by 3,000 (less depreciation)",
      f["projected_fixed_assets"] == PRIOR["projected_fixed_assets"] - f["depreciation_amortization"] + 300_000)
check("a -1,000 OCA line RAISES the projected OCA balance by 1,000", f["projected_other_current_assets"] == 100_000)

print("Scoreboard aggregation reads the stored sign as-is:")
pd = SimpleNamespace(owner_total_draws=-950_000, ar_change=100, inventory_change=0, other_current_assets_change=-300)
check("owner draws pass through signed", _get_metric_value(pd, "owner_total_draws") == -950_000)
check("CF asset changes = -(ΔAR + ΔInv) + OCA cash", _get_metric_value(pd, "cf_assets_change") == -100 - 300)

print("Targets prior-year column:")
def rec(month, od, np_):
    return SimpleNamespace(month=month, revenue=1_000_000, cost_of_sales=400_000, payroll_expenses=200_000,
        marketing_expenses=0, overhead_expenses=100_000, other_income_expense=0, job_count=5,
        cash=1_000_000, accounts_receivable=0, inventory=0, accounts_payable=0,
        equity_before_net_profit=5_000_000, owner_distributions=od, net_profit_for_year=np_)
year = [rec(1, -1_000_000, 300_000), rec(2, -2_000_000, 600_000), rec(12, -9_500_000, 3_600_000)]
agg = _aggregate_actuals(year, opening_bs={"cash": 0, "accounts_receivable": 0, "inventory": 0, "accounts_payable": 0, "equity": 5_000_000})
check("owner draws = the year-end balance, signed (-95,000)", agg["owner_total_draws"] == -9_500_000, agg["owner_total_draws"])
check("total equity includes the owner line", _total_equity(year[-1]) == 5_000_000 - 9_500_000 + 3_600_000)

print()
print("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(0 if not fails else 1)
