import os
import sys
from logging.config import fileConfig
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from alembic import context

# Make app importable from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401 — registers models with Base

config = context.config

# Override sqlalchemy.url from .env if present
db_url = os.getenv("DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    connect_args = {}
    if str(section.get("sqlalchemy.url", "")).startswith("postgresql"):
        # ALTER TABLE needs an exclusive lock. If a leftover session (a stale
        # uvicorn worker, an open psql, a GUI client) still holds even a read
        # lock on that table, the ALTER waits forever — and because migrations
        # run at app import, the backend never answers its health check and the
        # launcher just sits there. Fail fast and loud instead.
        #
        # Set it as a libpq connection option, NOT with connection.execute("SET
        # ..."): executing anything on the connection before Alembic begins its
        # transaction auto-begins one, Alembic then reuses it without owning it,
        # and the whole migration is rolled back when the connection closes.
        connect_args["options"] = "-c lock_timeout=15s"
    connectable = engine_from_config(section, prefix="sqlalchemy.",
                                     poolclass=pool.NullPool, connect_args=connect_args)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # required for SQLite ALTER TABLE support
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
