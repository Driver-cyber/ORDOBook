"""The chart-of-accounts view, against a seeded database.

Checks the two things this screen has to get right:

  * it agrees with the figures — categories come from `resolve_categories`, the
    same function that decides what gets stored, so the sheet can never tell the
    advisor one thing while the totals say another;
  * it survives the account names real charts actually contain, above all the
    same name in two sections and a vehicle called "2020 Toyota Tundra".

    cd backend && python scripts/verify_chart_of_accounts.py
"""
import atexit
import json
import os
import shutil
import subprocess
import sys
import tempfile

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

_tmp = tempfile.mkdtemp(prefix="ordobook_coa_")
atexit.register(lambda: shutil.rmtree(_tmp, ignore_errors=True))
DB = os.path.join(_tmp, "coa.db")
URL = f"sqlite:///{DB}"

FAILED = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f"  [{detail}]" if detail and not cond else ""))
    if not cond:
        FAILED.append(name)


def line(name, section, subsection, periods):
    return {"account_name": name, "row_type": "line_item", "section": section,
            "subsection": subsection, "values": {p: 1000 for p in periods}}


JAN, FEB = "January 2026", "February 2026"

# Both months carry the same accounts, except "Old Software" which stops in January
# and "New Van" which starts in February.
def rows_for(periods, *, include_old=True, include_new=False):
    r = [
        line("Sales", "income", "", periods),
        line("Supplies", "cogs", "", periods),                    # same name,
        line("Supplies", "expenses", "overhead", periods),        # two sections
        line("2020 Toyota Tundra", "assets", "fixed_assets", periods),
        line("2020 Toyota Tundra", "expenses", "overhead", periods),
        line("Rent", "expenses", "overhead", periods),
        line("Checking", "assets", "bank_accounts", periods),
    ]
    if include_old:
        r.append(line("Old Software", "expenses", "overhead", periods))
    if include_new:
        r.append(line("New Van", "assets", "fixed_assets", periods))
    return r


subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
               cwd=BACKEND, env=dict(os.environ, DATABASE_URL=URL),
               capture_output=True, text=True, check=True)

engine = create_engine(URL)

# Seed through the ORM: `clients` carries JSON columns whose Python-side defaults
# a raw INSERT skips, and an empty string is not valid JSON on the way back out.
from app.models.client import Client  # noqa: E402
from app.models.monthly_actuals import MonthlyActuals  # noqa: E402
from app.models.account_mapping import AccountMapping  # noqa: E402
from app.routers.ingestion import chart_of_accounts  # noqa: E402

db = sessionmaker(bind=engine)()
db.add(Client(id=1, name="Chart Co"))
db.flush()
for month, rows in ((1, rows_for([JAN], include_old=True)),
                    (2, rows_for([FEB], include_old=False, include_new=True))):
    db.add(MonthlyActuals(client_id=1, fiscal_year=2026, month=month,
                          status="confirmed", raw_data={"rows": rows}))
# One confirmed mapping; everything else is inferred from section context.
db.add(AccountMapping(client_id=1, report_type="profit_and_loss", section="expenses",
                      qb_account_name="Rent", ordobook_category="overhead_expenses"))
db.commit()
result = chart_of_accounts(1, db)
accounts = result["accounts"]
by = {(a["report_type"], a["section"], a["raw_account_name"]): a for a in accounts}

print("Every imported account appears exactly once:")
check("nine distinct accounts across both months", len(accounts) == 9, len(accounts))
check("no account is listed twice",
      len({(a["report_type"], a["section"], a["raw_account_name"]) for a in accounts}) == len(accounts))

print()
print("The same name in two sections stays two rows (migration 032):")
sup = [a for a in accounts if a["raw_account_name"] == "Supplies"]
check("'Supplies' appears once per section", len(sup) == 2, len(sup))
check("the COGS one maps to Cost of Sales",
      by[("profit_and_loss", "cogs", "Supplies")]["ordobook_category"] == "cost_of_sales",
      by[("profit_and_loss", "cogs", "Supplies")]["ordobook_category"])
check("the Expenses one maps to Overhead",
      by[("profit_and_loss", "expenses", "Supplies")]["ordobook_category"] == "overhead_expenses",
      by[("profit_and_loss", "expenses", "Supplies")]["ordobook_category"])

print()
print("The vehicle is on both statements, mapped differently on each:")
check("the asset side is Fixed Assets",
      by[("balance_sheet", "assets", "2020 Toyota Tundra")]["ordobook_category"] == "total_fixed_assets")
check("the expense side is Overhead",
      by[("profit_and_loss", "expenses", "2020 Toyota Tundra")]["ordobook_category"] == "overhead_expenses")

print()
print("A name starting with digits is NOT read as an account number:")
check("the chart is not detected as numbered", result["numbered_chart"] is False)
check("'2020 Toyota Tundra' keeps its whole name",
      by[("balance_sheet", "assets", "2020 Toyota Tundra")]["account_name"] == "2020 Toyota Tundra",
      by[("balance_sheet", "assets", "2020 Toyota Tundra")]["account_name"])
check("and carries no account number",
      by[("balance_sheet", "assets", "2020 Toyota Tundra")]["account_number"] == "")

print()
print("Saved vs inferred is visible:")
check("the confirmed mapping reads 'saved'",
      by[("profit_and_loss", "expenses", "Rent")]["mapping_source"] == "saved",
      by[("profit_and_loss", "expenses", "Rent")]["mapping_source"])
check("an account nobody has confirmed reads 'inferred'",
      by[("profit_and_loss", "income", "Sales")]["mapping_source"] == "inferred")
check("the summary counts the inferred ones", result["summary"]["inferred"] == 8,
      result["summary"]["inferred"])

print()
print("An account that stopped appearing is still listed, and flagged:")
old = by[("profit_and_loss", "expenses", "Old Software")]
check("'Old Software' is still on the chart", old is not None)
check("its last sighting is January", old["last_seen"] == JAN, old["last_seen"])
check("it is flagged as absent from the latest import", old["in_latest_import"] is False)
check("the summary counts one retired account", result["summary"]["retired"] == 1,
      result["summary"]["retired"])

print()
print("An account that appeared later is dated from its first sighting:")
van = by[("balance_sheet", "assets", "New Van")]
check("'New Van' first seen February", van["first_seen"] == FEB, van["first_seen"])
check("and is in the latest import", van["in_latest_import"] is True)
check("latest period is February", result["latest_period"] == FEB, result["latest_period"])

print()
if FAILED:
    print(f"{len(FAILED)} CHECK(S) FAILED: " + ", ".join(FAILED))
    sys.exit(1)
print("ALL PASS")
