#!/bin/bash
#
# ORDOBOOK Stop — double-click to shut down cleanly.
#
# Stops the backend (uvicorn) and frontend (Vite) that the launcher started.
# Leaves PostgreSQL running by default — it's a shared service and starting it
# is the slow part. Pass --pg to stop it too.

set -uo pipefail

BACKEND_PORT=8000
FRONTEND_PORT=5173
PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
PGDATA="/opt/homebrew/var/postgresql@17"
PROJECT_DIR="/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"

say() { printf "  %s\n" "$1"; }

kill_port() {
  local port="$1" label="$2"
  local pids
  pids=$(lsof -ti "tcp:${port}" 2>/dev/null)
  if [ -z "$pids" ]; then
    say "•  ${label} wasn't running (port ${port} free)"
    return
  fi
  # Ask nicely first, then insist.
  echo "$pids" | xargs kill 2>/dev/null
  for _ in $(seq 1 10); do
    lsof -ti "tcp:${port}" >/dev/null 2>&1 || break
    sleep 0.3
  done
  if lsof -ti "tcp:${port}" >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" 2>/dev/null | xargs kill -9 2>/dev/null
    say "✅ ${label} force-stopped (port ${port})"
  else
    say "✅ ${label} stopped (port ${port})"
  fi
}

echo ""
echo "── Stopping ORDOBOOK ──────────────────────"

kill_port "$FRONTEND_PORT" "Frontend"
kill_port "$BACKEND_PORT"  "Backend"

# A uvicorn --reload worker that was mid-restart (a pull landed while it was
# running) can outlive the port holder. It isn't on the port, so kill_port
# misses it — but it can still hold a Postgres connection, and a connection
# that touched a table blocks the next migration's ALTER TABLE on that table.
if pgrep -f "uvicorn app.main:app" >/dev/null 2>&1; then
  pkill -f "uvicorn app.main:app" 2>/dev/null; sleep 1
  pkill -9 -f "uvicorn app.main:app" 2>/dev/null
  say "✅ Stray backend worker(s) stopped"
fi
pkill -f "vite --port ${FRONTEND_PORT}" 2>/dev/null && say "✅ Stray Vite process stopped"

# Leftover database sessions are the other way a launch can hang: an "idle in
# transaction" session holds its locks until it ends. Nothing but ORDOBOOK uses
# this database, so end them here rather than leave the next migration waiting.
DB_URL=$(sed -n 's/^DATABASE_URL=//p' "$PROJECT_DIR/backend/.env" 2>/dev/null | sed 's/+psycopg2//; s/^"//; s/"$//')
if [ -n "$DB_URL" ] && "$PG_BIN/pg_isready" -q 2>/dev/null; then
  ended=$("$PG_BIN/psql" "$DB_URL" -Atqc \
    "select count(pg_terminate_backend(pid)) from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
        and state in ('idle in transaction', 'idle in transaction (aborted)')" 2>/dev/null)
  [ -n "$ended" ] && [ "$ended" != "0" ] && say "✅ Ended ${ended} stuck database session(s)"
  open=$("$PG_BIN/psql" "$DB_URL" -Atqc \
    "select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()" 2>/dev/null)
  [ -n "$open" ] && [ "$open" != "0" ] && say "•  ${open} other database session(s) still open (psql / a GUI?) — close them if the next launch hangs"
fi

if [ "${1:-}" = "--pg" ]; then
  if "$PG_BIN/pg_isready" -q 2>/dev/null; then
    "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 \
      && say "✅ Postgres stopped" \
      || say "⚠️  Postgres wouldn't stop cleanly"
  else
    say "•  Postgres wasn't running"
  fi
else
  say "•  Postgres left running (use --pg to stop it too)"
fi

echo ""
echo "  Done."
echo "───────────────────────────────────────────"
echo ""
sleep 1
