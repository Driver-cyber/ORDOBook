"""Direction tests for owner activity derived from actuals (migration 026).

The actuals column `owner_distributions` is QB's signed YTD equity balance for
draws / distributions / contributions: draws negative, investments positive,
reset each fiscal year. The engine turns the month-over-month change in that
balance into the period's owner draw and subtracts it from net cash; the
Targets prior-year column reads the year-end balance directly. These checks
assert the DIRECTION each piece moves, which is what catches a sign error.
Run:  python scripts/verify_owner_draws.py
"""
import os, sys
from types import SimpleNamespace
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.engine.forecast import build_forecast_period
from app.routers.targets import _aggregate_actuals, _total_equity

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
PRIOR = {  # prior month balances equal this month's, so working-capital deltas are 0
    "projected_ar": 1_000_000, "projected_inventory": 0, "projected_ap": 500_000,
    "projected_other_current_assets": 0, "projected_current_debt": 0,
    "projected_long_term_debt": 1_000_000, "owner_distributions_balance": 0,
}

def run(balance, prior_balance=0):
    return build_forecast_period(month=3, config={}, actuals={**ACTUALS, "owner_distributions": balance},
                                 prior_projected={**PRIOR, "owner_distributions_balance": prior_balance})

base = run(0)
check("no owner activity: net cash = net profit (no other deltas)", base["net_cash_flow"] == base["net_profit"],
      (base["net_cash_flow"], base["net_profit"]))

print("Direction — the balance delta must move cash the way its sign says:")
jan = run(-9_500_000)                       # January: balance measured against 0
check("a -95,000 YTD balance in the first month is a 95,000 draw", jan["owner_distributions"] == 9_500_000, jan["owner_distributions"])
check("that draw REDUCES net cash by 95,000", base["net_cash_flow"] - jan["net_cash_flow"] == 9_500_000)
check("owner_total_draws carries the same positive draw amount", jan["owner_total_draws"] == 9_500_000)

feb = run(-12_000_000, prior_balance=-9_500_000)
check("balance moving -95,000 → -120,000 is a 25,000 draw that month", feb["owner_distributions"] == 2_500_000, feb["owner_distributions"])
check("it REDUCES net cash by 25,000, not 120,000", base["net_cash_flow"] - feb["net_cash_flow"] == 2_500_000)

inv = run(-8_500_000, prior_balance=-9_500_000)
check("balance moving -95,000 → -85,000 is a 10,000 investment (negative draw)", inv["owner_distributions"] == -1_000_000, inv["owner_distributions"])
check("it RAISES net cash by 10,000", inv["net_cash_flow"] - base["net_cash_flow"] == 1_000_000)

flat = run(-9_500_000, prior_balance=-9_500_000)
check("an unchanged balance is zero activity", flat["owner_distributions"] == 0 and flat["net_cash_flow"] == base["net_cash_flow"])

print("Traceability:")
check("calc_trace records the balance and prior balance behind the draw",
      jan["calc_trace"]["owner_draws"]["value"] == 9_500_000
      and jan["calc_trace"]["owner_draws"]["components"][0]["value"] == -9_500_000)

print("Targets prior-year column:")
def rec(month, od, np_):
    return SimpleNamespace(month=month, revenue=1_000_000, cost_of_sales=400_000, payroll_expenses=200_000,
        marketing_expenses=0, overhead_expenses=100_000, other_income_expense=0, job_count=5,
        cash=1_000_000, accounts_receivable=0, inventory=0, accounts_payable=0,
        equity_before_net_profit=5_000_000, owner_distributions=od, net_profit_for_year=np_)
year = [rec(1, -1_000_000, 300_000), rec(2, -2_000_000, 600_000), rec(12, -9_500_000, 3_600_000)]
agg = _aggregate_actuals(year, opening_bs={"cash": 0, "accounts_receivable": 0, "inventory": 0,
                                           "accounts_payable": 0, "equity": 5_000_000})
check("owner draws = the year-end balance, signed (-95,000), not the sum of months",
      agg["owner_total_draws"] == -9_500_000, agg["owner_total_draws"])
check("total equity includes the owner line", _total_equity(year[-1]) == 5_000_000 - 9_500_000 + 3_600_000)
unmapped = [rec(1, 0, 300_000), rec(12, 0, 3_600_000)]
agg2 = _aggregate_actuals(unmapped, opening_bs={"cash": 0, "accounts_receivable": 0, "inventory": 0,
                                                "accounts_payable": 0, "equity": 5_000_000 + 9_500_000})
check("before the account is mapped, the equity roll-forward still supplies the figure",
      agg2["owner_total_draws"] == (5_000_000 + 3_600_000) - (5_000_000 + 9_500_000) - 3_600_000, agg2["owner_total_draws"])

print()
print("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(0 if not fails else 1)
