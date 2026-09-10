"""Programmatic Alembic migration runner.

Used by the packaged desktop app to bring the user's EXISTING database up to head
on every launch, so schema changes ship safely across versions without wiping
data. Kept separate from main.py so it can be imported/tested without FastAPI.

Why this exists: the packaged app's SQLite DB lives in the OS app-data dir, OUTSIDE
the .app bundle, so it survives re-installs. But surviving isn't enough — when a new
version adds a column, the old DB needs that column. `create_all` only creates
missing *tables*, never alters existing ones. Running `alembic upgrade head` on
startup applies pending migrations in order:
  - Fresh DB  → builds the full schema and stamps it at head.
  - Existing DB → applies only the new migrations, preserving all data.
"""
import os
from alembic.config import Config
from alembic import command

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _alembic_config() -> Config:
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    # Absolute paths so it resolves regardless of cwd (packaged app, tests, CLI).
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def upgrade_to_head() -> None:
    """Apply any pending migrations against the configured database."""
    command.upgrade(_alembic_config(), "head")


def auto_migrate_if_enabled() -> None:
    """Bring the database to head on startup. On by default; ORDOBOOK_AUTO_MIGRATE=0 disables.

    Runs in dev as well as in the packaged app. Migrations must run BEFORE
    main.py's create_all(): create_all creates missing tables without telling
    Alembic and never alters existing ones, so running it first leaves the
    version marker behind reality (a table exists that Alembic thinks it still
    has to create — the 021 DuplicateTable failure) and leaves new columns
    missing until someone runs 'alembic upgrade head' by hand. Migrating first
    makes create_all a harmless safety net.

    Set ORDOBOOK_AUTO_MIGRATE=0 to opt out (e.g. when deliberately holding a
    database at an older revision).
    """
    if os.getenv("ORDOBOOK_AUTO_MIGRATE", "1") != "0":
        upgrade_to_head()
