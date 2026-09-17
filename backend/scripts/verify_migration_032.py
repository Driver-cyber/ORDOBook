"""Migration 032 on a SEEDED database, up and back down.

A migration that only runs against an empty table proves nothing — that lesson
cost us once already (a bind-parameter bug inside a JSON literal let a data
migration "pass" on zero rows). So this builds a database at 031, seeds it with
the exact shape the bug needs, migrates to 032, and checks what actually moved.

The seed is the real collision: a client whose chart of accounts has "Supplies"
under COGS *and* "Supplies" under Expenses, plus a balance-sheet account sharing
a name with a P&L account (the vehicle case from 2026-09-14), plus a mapping for
an account no longer present in any stored import.

    cd backend && python scripts/verify_migration_032.py
"""
import atexit
import json
import os
import shutil
import subprocess
import sys
import tempfile

from sqlalchemy import create_engine, inspect, text

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

_tmp = tempfile.mkdtemp(prefix="ordobook_032_")
atexit.register(lambda: shutil.rmtree(_tmp, ignore_errors=True))
DB = os.path.join(_tmp, "m032.db")
URL = f"sqlite:///{DB}"
PYTHON = sys.executable

FAILED = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f"  [{detail}]" if detail and not cond else ""))
    if not cond:
        FAILED.append(name)


def alembic(*args):
    env = dict(os.environ, DATABASE_URL=URL)
    res = subprocess.run([PYTHON, "-m", "alembic", *args],
                         cwd=BACKEND, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr, file=sys.stderr)
        sys.exit(f"alembic {' '.join(args)} failed")
    return res


def rows(engine, sql):
    with engine.connect() as c:
        return list(c.execute(text(sql)))


def line(name, section, subsection=""):
    return {"account_name": name, "row_type": "line_item", "section": section,
            "subsection": subsection, "values": {"January 2026": 100}}


RAW = {"rows": [
    line("Supplies", "cogs"),
    line("Supplies", "expenses", "overhead"),
    line("2020 Toyota Tundra", "assets", "fixed_assets"),
    line("2020 Toyota Tundra", "expenses", "overhead"),
    line("Rent", "expenses", "overhead"),
]}


def seed(engine):
    with engine.begin() as c:
        c.execute(text("INSERT INTO clients (id, name) VALUES (1, 'Seeded Co')"))
        c.execute(
            text("""INSERT INTO monthly_actuals (client_id, fiscal_year, month, status, raw_data)
                    VALUES (1, 2026, 1, 'confirmed', :raw)"""),
            {"raw": json.dumps(RAW)},
        )
        for rt, name, cat in [
            ("profit_and_loss", "Supplies", "overhead_expenses"),   # the collision
            ("profit_and_loss", "2020 Toyota Tundra", "overhead_expenses"),
            ("balance_sheet", "2020 Toyota Tundra", "total_fixed_assets"),
            ("profit_and_loss", "Rent", "overhead_expenses"),
            ("profit_and_loss", "Gone Account", "overhead_expenses"),  # not in any import
        ]:
            c.execute(
                text("""INSERT INTO account_mappings
                        (client_id, report_type, qb_account_name, ordobook_category, is_excluded)
                        VALUES (1, :rt, :n, :c, 0)"""),
                {"rt": rt, "n": name, "c": cat},
            )


print("Building a database at 031 and seeding the collision ...")
alembic("upgrade", "031")
engine = create_engine(URL)

cols = {c["name"] for c in inspect(engine).get_columns("account_mappings")}
check("031 has no section column yet", "section" not in cols)

seed(engine)
check("seeded 5 mappings, one of them the ambiguous 'Supplies'",
      rows(engine, "SELECT COUNT(*) FROM account_mappings")[0][0] == 5)

print()
print("Upgrading to 032 ...")
alembic("upgrade", "032")
engine = create_engine(URL)

cols = {c["name"] for c in inspect(engine).get_columns("account_mappings")}
check("section column exists", "section" in cols)

uq = {u["name"]: u["column_names"] for u in inspect(engine).get_unique_constraints("account_mappings")}
check("the new unique constraint includes section",
      any("section" in v for v in uq.values()), str(uq))
check("the old constraint is gone",
      "uq_account_mappings_client_report_account" not in uq, str(list(uq)))

supplies = rows(engine, """SELECT section, ordobook_category FROM account_mappings
                           WHERE qb_account_name = 'Supplies' ORDER BY section""")
check("'Supplies' was split into one row per section it appears in",
      len(supplies) == 2, f"{len(supplies)} rows: {supplies}")
check("the sections are the real ones from the stored rows",
      [s for s, _ in supplies] == ["cogs", "expenses"], str([s for s, _ in supplies]))
check("BOTH keep today's category, so nothing moves on upgrade",
      {c for _, c in supplies} == {"overhead_expenses"}, str(supplies))

tundra = rows(engine, """SELECT report_type, section FROM account_mappings
                         WHERE qb_account_name = '2020 Toyota Tundra' ORDER BY report_type""")
check("the cross-statement vehicle stays two rows, correctly sectioned",
      tundra == [("balance_sheet", "assets"), ("profit_and_loss", "expenses")], str(tundra))

gone = rows(engine, "SELECT section FROM account_mappings WHERE qb_account_name = 'Gone Account'")
check("an account absent from every import keeps section='' (legacy catch-all)",
      gone == [("",)], str(gone))

print()
print("The split rows can now hold DIFFERENT categories — impossible before 032:")
with engine.begin() as c:
    c.execute(text("""UPDATE account_mappings SET ordobook_category = 'cost_of_sales'
                      WHERE qb_account_name = 'Supplies' AND section = 'cogs'"""))
after = dict(rows(engine, """SELECT section, ordobook_category FROM account_mappings
                             WHERE qb_account_name = 'Supplies'"""))
check("COGS Supplies is cost_of_sales, Expenses Supplies is overhead",
      after == {"cogs": "cost_of_sales", "expenses": "overhead_expenses"}, str(after))

print()
print("Downgrading back to 031 ...")
alembic("downgrade", "031")
engine = create_engine(URL)

cols = {c["name"] for c in inspect(engine).get_columns("account_mappings")}
check("section column removed", "section" not in cols)
uq = {u["name"]: u["column_names"] for u in inspect(engine).get_unique_constraints("account_mappings")}
check("the old unique constraint is restored",
      "uq_account_mappings_client_report_account" in uq, str(list(uq)))
check("'Supplies' collapses back to a single row",
      rows(engine, "SELECT COUNT(*) FROM account_mappings WHERE qb_account_name='Supplies'")[0][0] == 1)
check("the original five mappings survive the round trip",
      rows(engine, "SELECT COUNT(*) FROM account_mappings")[0][0] == 5)

print()
if FAILED:
    print(f"{len(FAILED)} CHECK(S) FAILED: " + ", ".join(FAILED))
    sys.exit(1)
print("ALL PASS")
