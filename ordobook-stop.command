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
echo "  Done. Close the ORDOBOOK window if it's still open."
echo "───────────────────────────────────────────"
echo ""
sleep 1
