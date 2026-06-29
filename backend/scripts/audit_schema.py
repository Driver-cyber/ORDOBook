"""
Schema audit / fresh-build regression test.

Builds two throwaway SQLite databases and proves they match:
  A) via `alembic upgrade head`   — the incremental-upgrade path (existing installs)
  B) via Base.metadata.create_all — the fresh-app-launch path (a packaged app's
                                    first run, where there is no DB yet)

Then diffs the two schemas (tables, columns, types, nullability). Any drift, or
any failure to build either way, is a bug that would surface the first time a
packaged ORDOBOOK runs on a clean machine.

Run it before any Electron packaging step:

    cd backend
    source venv/bin/activate
    python scripts/audit_schema.py

Exits non-zero if either build fails or the schemas drift.
"""
import os
import sys
import atexit
import shutil
import subprocess
import tempfile
from sqlalchemy import create_engine, inspect

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

_tmp = tempfile.mkdtemp(prefix="ordobook_audit_")
atexit.register(lambda: shutil.rmtree(_tmp, ignore_errors=True))
DB_MIGRATIONS = os.path.join(_tmp, "migrations.db")
DB_MODELS = os.path.join(_tmp, "models.db")
PYTHON = sys.executable


def build_via_alembic():
    print("A) Building schema via `alembic upgrade head` ...")
    env = dict(os.environ)
    env["DATABASE_URL"] = f"sqlite:///{DB_MIGRATIONS}"
    res = subprocess.run(
        [PYTHON, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND, env=env, capture_output=True, text=True,
    )
    if res.returncode != 0:
        print("   ALEMBIC FAILED:\n", res.stdout, "\n", res.stderr)
        sys.exit(1)
    print("   alembic upgrade head: OK")


def build_via_models():
    print("B) Building schema via Base.metadata.create_all ...")
    os.environ["DATABASE_URL"] = f"sqlite:///{DB_MODELS}"
    from app.database import Base, engine
    import app.models  # noqa: F401 — registers every model with Base
    Base.metadata.create_all(bind=engine)
    print("   create_all: OK")


def schema_of(db_path):
    eng = create_engine(f"sqlite:///{db_path}")
    insp = inspect(eng)
    out = {}
    for t in insp.get_table_names():
        if t == "alembic_version":
            continue
        out[t] = {
            c["name"]: {"type": str(c["type"]), "nullable": c["nullable"]}
            for c in insp.get_columns(t)
        }
    eng.dispose()
    return out


def main():
    build_via_alembic()
    build_via_models()

    mig = schema_of(DB_MIGRATIONS)
    mod = schema_of(DB_MODELS)

    issues = []
    only_mig, only_mod = set(mig) - set(mod), set(mod) - set(mig)
    if only_mig:
        issues.append(f"Tables in MIGRATIONS but not MODELS: {sorted(only_mig)}")
    if only_mod:
        issues.append(f"Tables in MODELS but not MIGRATIONS: {sorted(only_mod)}")

    for t in sorted(set(mig) & set(mod)):
        mc, oc = mig[t], mod[t]
        for col in sorted(set(mc) - set(oc)):
            issues.append(f"[{t}.{col}] in MIGRATIONS but not MODELS")
        for col in sorted(set(oc) - set(mc)):
            issues.append(f"[{t}.{col}] in MODELS but not MIGRATIONS")
        for col in sorted(set(mc) & set(oc)):
            if mc[col]["type"].upper() != oc[col]["type"].upper():
                issues.append(
                    f"[{t}.{col}] TYPE: migrations={mc[col]['type']} vs models={oc[col]['type']}"
                )
            if mc[col]["nullable"] != oc[col]["nullable"]:
                issues.append(
                    f"[{t}.{col}] NULLABLE: migrations={mc[col]['nullable']} vs models={oc[col]['nullable']}"
                )

    print("=" * 66)
    print(f"Tables via migrations: {len(mig)} | via models: {len(mod)}")
    if not issues:
        print("PASS — migrations and models produce identical schemas.")
        sys.exit(0)
    print(f"FAIL — {len(issues)} difference(s):")
    for i in issues:
        print("  -", i)
    sys.exit(1)


if __name__ == "__main__":
    main()
