"""Checks for the category-totals rule (migration 030).

One rule: every line-item account belongs to exactly one category, and each
category is the direct sum of the accounts mapped to it, whatever statement
section it came from. Net profit therefore ties to QuickBooks by construction —
every P&L dollar is counted exactly once.

The cases below are the ones the old plug got wrong, plus the one the first cut
of the direct sum got wrong. Run:  python scripts/verify_category_totals.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.engine.category_totals import compute_period_totals, category_accounts

P = "Jan 2026"
fails = []


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))
    if not cond:
        fails.append(name)


def row(name, section, subsection, value):
    return {"row_type": "line_item", "account_name": name, "section": section,
            "subsection": subsection, "values": {P: value}}


def totals(rows, mappings):
    return compute_period_totals(rows, mappings)[P]


def net_profit(t):
    return t.get("revenue", 0) - t.get("cost_of_sales", 0) - t.get("total_expenses", 0) \
        + t.get("other_income_expense", 0)


print("The same account name on both statements (a vehicle is an asset AND an expense):")
VEHICLES = [
    row("Sales", "income", "", 10_000_000),
    row("2020 Toyota Tundra", "assets", "fixed_assets", 3_500_000),
    row("2023 Ford E-Series", "assets", "fixed_assets", 2_800_000),
    row("Rent", "expenses", "overhead", 1_000_000),
    row("2020 Toyota Tundra", "expenses", "overhead", 120_000),
    row("2023 Ford E-Series", "expenses", "overhead", 95_000),
]
VMAP = {
    ("balance_sheet", "assets", "2020 Toyota Tundra"): "total_fixed_assets",
    ("balance_sheet", "assets", "2023 Ford E-Series"): "total_fixed_assets",
    ("profit_and_loss", "expenses", "2020 Toyota Tundra"): "overhead_expenses",
    ("profit_and_loss", "expenses", "2023 Ford E-Series"): "overhead_expenses",
    ("profit_and_loss", "expenses", "Rent"): "overhead_expenses",
}
v = totals(VEHICLES, VMAP)
check("the expense side reaches Overhead", v["overhead_expenses"] == 1_215_000, v["overhead_expenses"])
check("the asset side reaches Fixed Assets", v["total_fixed_assets"] == 6_300_000, v["total_fixed_assets"])
names = [a["account_name"] for a in category_accounts(VEHICLES, VMAP, "overhead_expenses")]
check("both vehicles appear on the Overhead schedule",
      names == ["Rent", "2020 Toyota Tundra", "2023 Ford E-Series"], names)

print("An expense-section account mapped to Cost of Sales is counted ONCE:")
SUBS = [
    row("Sales", "income", "", 10_000_000),
    row("Materials", "cogs", "", 4_000_000),
    row("Wages", "expenses", "payroll", 2_000_000),
    row("Rent", "expenses", "overhead", 1_000_000),
    row("Subcontractors", "expenses", "overhead", 500_000),
]
s = totals(SUBS, {("profit_and_loss", "expenses", "Subcontractors"): "cost_of_sales"})
check("it lands in Cost of Sales", s["cost_of_sales"] == 4_500_000, s["cost_of_sales"])
check("and NOT also in Overhead", s["overhead_expenses"] == 1_000_000, s["overhead_expenses"])
check("Total Expenses = payroll + marketing + depreciation + overhead",
      s["total_expenses"] == 3_000_000, s["total_expenses"])
check("net profit = 10,000,000 − 4,500,000 − 3,000,000", net_profit(s) == 2_500_000, net_profit(s))

print("A COGS-section account mapped to Overhead does not vanish:")
c = totals(SUBS, {("profit_and_loss", "cogs", "Materials"): "overhead_expenses"})
check("it lands in Overhead", c["overhead_expenses"] == 5_500_000, c["overhead_expenses"])
check("Cost of Sales is empty", c.get("cost_of_sales", 0) == 0, c.get("cost_of_sales", 0))
check("net profit is unchanged by where it sits",
      net_profit(c) == 10_000_000 - 0 - 7_500_000, net_profit(c))

print("Every P&L dollar counted exactly once (the tie to QB's net income):")
FULL = SUBS + [
    row("Advertising", "expenses", "marketing", 150_000),
    row("Depreciation", "expenses", "depreciation", 80_000),
    row("Interest Income", "other_income", "", 2_000),
    row("Interest Expense", "other_expenses", "", 30_000),
]
f = totals(FULL, {})
gross = sum(r["values"][P] for r in FULL if r["section"] == "income")
spent = sum(r["values"][P] for r in FULL if r["section"] in ("cogs", "expenses"))
other = 2_000 - 30_000
check("net profit = income − (COGS + expenses) + other income/expense",
      net_profit(f) == gross - spent + other, (net_profit(f), gross - spent + other))
check("Other Expenses are stored negative", f["other_income_expense"] == other, f["other_income_expense"])

print("Unmapped accounts still land somewhere, from section context:")
u = totals(SUBS, {})
check("an unmapped expense-section row reaches Overhead",
      u["overhead_expenses"] == 1_500_000, u["overhead_expenses"])

print("A retired category on a saved mapping is re-derived, not trusted:")
r = totals(SUBS, {("profit_and_loss", "expenses", "Rent"): "excluded"})
check("the retired mapping's dollars are in Overhead, not lost",
      r["overhead_expenses"] == 1_500_000, r["overhead_expenses"])

print()
print("The same name in TWO sections of ONE statement (migration 032):")
# "Supplies" is a real account under COGS and a different real account under
# Expenses. Before 032 both shared the key ("profit_and_loss", "Supplies"), so
# saving either one dragged the other with it — and because Cost of Sales and
# Overhead both reduce net profit equally, the QuickBooks tie-out could not see it.
TWINS = [
    row("Supplies", "cogs", "", 1_000_000),
    row("Supplies", "expenses", "overhead", 500_000),
]

d = totals(TWINS, {})
check("with no saved mapping, section context separates them",
      d["cost_of_sales"] == 1_000_000 and d["overhead_expenses"] == 500_000,
      f'cos={d["cost_of_sales"]} overhead={d["overhead_expenses"]}')

# The advisor confirms the Expenses row as overhead. The COGS row must not move.
SAVED = {("profit_and_loss", "expenses", "Supplies"): "overhead_expenses"}
t = totals(TWINS, SAVED)
check("saving the Expenses row leaves Cost of Sales intact",
      t["cost_of_sales"] == 1_000_000, t["cost_of_sales"])
check("and Overhead holds only its own account",
      t["overhead_expenses"] == 500_000, t["overhead_expenses"])
check("net profit is unchanged either way",
      net_profit(d) == net_profit(t), f"{net_profit(d)} vs {net_profit(t)}")

# Both rows can now carry DIFFERENT categories — impossible before 032.
SPLIT = {
    ("profit_and_loss", "cogs", "Supplies"): "cost_of_sales",
    ("profit_and_loss", "expenses", "Supplies"): "marketing_expenses",
}
x = totals(TWINS, SPLIT)
check("the two rows can be mapped to different categories",
      x["cost_of_sales"] == 1_000_000 and x["marketing_expenses"] == 500_000,
      f'cos={x["cost_of_sales"]} marketing={x.get("marketing_expenses")}')

print()
print("A pre-032 mapping with no section still applies (two-tier lookup):")
LEGACY = {("profit_and_loss", "", "Supplies"): "marketing_expenses"}
l = totals(TWINS, LEGACY)
check("the legacy key matches both rows until they are re-confirmed",
      l["marketing_expenses"] == 1_500_000, l["marketing_expenses"])
check("a section-qualified key beats the legacy one",
      totals(TWINS, {**LEGACY,
                     ("profit_and_loss", "cogs", "Supplies"): "cost_of_sales"}
             )["cost_of_sales"] == 1_000_000, "section key wins")


# ── Overhead resolution: hard key vs schedule (migration 031) ────────────────
from app.engine.forecast import build_forecast_period  # noqa: E402

print()
print("Overhead resolution — presence, not truthiness:")

BASE_CFG = {"large_job_counts": {"9": 10}, "large_job_avg_value_monthly": {"9": 100_000}}


def overhead_for(cfg_extra):
    p = build_forecast_period(month=9, config={**BASE_CFG, **cfg_extra}, actuals=None)
    return p["overhead_expenses"], p["calc_trace"]["overhead_expenses"]


oh, tr = overhead_for({"overhead_detail_monthly": {"9": {"Rent": 250_000, "Phone": 34_000}}})
check("a schedule with no hard key sums its accounts", oh == 284_000, oh)
check("the trace lists each account",
      [c["label"] for c in tr["components"]] == ["Rent", "Phone"], tr["components"])

oh, tr = overhead_for({
    "other_overhead_monthly": {"9": 500_000},
    "overhead_detail_monthly": {"9": {"Rent": 250_000, "Phone": 34_000}},
})
check("a typed figure overrides the schedule", oh == 500_000, oh)
check("the trace says the schedule underneath was overridden",
      any("overridden" in c["label"] for c in tr["components"]), tr["components"])

oh, _ = overhead_for({
    "other_overhead_monthly": {"9": 0},
    "overhead_detail_monthly": {"9": {"Rent": 250_000}},
})
check("a typed ZERO still overrides (presence, not truthiness)", oh == 0, oh)

oh, _ = overhead_for({
    "other_overhead_monthly": {"8": 500_000},          # another month's key
    "overhead_detail_monthly": {"9": {"Rent": 250_000}},
})
check("clearing the cell (key removed) lets the schedule flow again", oh == 250_000, oh)

oh, _ = overhead_for({"other_overhead_monthly": {"9": 700_000}})
check("no schedule: the typed figure is used", oh == 700_000, oh)
oh, _ = overhead_for({})
check("neither: zero", oh == 0, oh)

print()
print("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(0 if not fails else 1)
