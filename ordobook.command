#!/bin/bash
#
# ORDOBOOK Launcher — double-click to start.
#
# Idempotent: safe to run repeatedly. Detects services that are already running
# (e.g. from a session that didn't shut down cleanly) and REUSES them rather than
# starting duplicates.
#
# Why the ports are fixed at 8000 / 5173:
#   vite.config.js proxies /api -> http://localhost:8000, so the backend port
#   cannot float in dev. (The packaged Electron app probes a free port instead,
#   because there FastAPI serves the frontend directly with no Vite proxy.)
#   Vite is started with --strictPort so it fails loudly instead of silently
#   drifting to 5174 and leaving you staring at a stale page.

set -uo pipefail

PROJECT_DIR="/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
PGDATA="/opt/homebrew/var/postgresql@17"
BACKEND_PORT=8000
FRONTEND_PORT=5173
APP_URL="http://localhost:${FRONTEND_PORT}"
LOG_DIR="$HOME/Library/Logs/ORDOBOOK"
CHROME_PROFILE="$HOME/Library/Application Support/ORDOBOOK/chrome-profile"

mkdir -p "$LOG_DIR" "$CHROME_PROFILE"

say()  { printf "  %s\n" "$1"; }
fail() { printf "\n❌ %s\n\n" "$1"; read -r -p "Press Return to close..." _; exit 1; }

backend_ok()  { curl -sf "http://localhost:${BACKEND_PORT}/api/health" >/dev/null 2>&1; }
frontend_ok() { curl -sf -o /dev/null "$APP_URL" 2>/dev/null; }
port_busy()   { lsof -ti "tcp:$1" >/dev/null 2>&1; }

echo ""
echo "── ORDOBOOK ───────────────────────────────"

# ── 1. PostgreSQL ─────────────────────────────────────────────────────────
if "$PG_BIN/pg_isready" -q 2>/dev/null; then
  say "✅ Postgres already running"
else
  say "▸  Starting Postgres..."
  "$PG_BIN/pg_ctl" -D "$PGDATA" start >"$LOG_DIR/postgres.log" 2>&1
  for _ in $(seq 1 20); do
    "$PG_BIN/pg_isready" -q 2>/dev/null && break
    sleep 0.5
  done
  "$PG_BIN/pg_isready" -q 2>/dev/null \
    || fail "Postgres didn't start. Check $LOG_DIR/postgres.log
   If it mentions a stale postmaster.pid, see ordobook-stop.command."
  say "✅ Postgres started"
fi

# ── 2. Backend (FastAPI / uvicorn) ────────────────────────────────────────
if backend_ok; then
  say "✅ Backend already running on ${BACKEND_PORT}"
elif port_busy "$BACKEND_PORT"; then
  fail "Port ${BACKEND_PORT} is in use but isn't answering ORDOBOOK's health check.
   Something else has it. Inspect with:   lsof -i :${BACKEND_PORT}
   Or clear ORDOBOOK's own processes with: ordobook-stop.command"
else
  say "▸  Starting backend..."
  cd "$PROJECT_DIR/backend" || fail "Can't find $PROJECT_DIR/backend"
  [ -x "./venv/bin/uvicorn" ] \
    || fail "No venv found at $PROJECT_DIR/backend/venv
   Create it:  python3.12 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  nohup ./venv/bin/uvicorn app.main:app --port "$BACKEND_PORT" \
    >"$LOG_DIR/backend.log" 2>&1 &
  for _ in $(seq 1 40); do backend_ok && break; sleep 0.5; done
  backend_ok || fail "Backend didn't come up. Check $LOG_DIR/backend.log"
  say "✅ Backend started"
fi

# ── 3. Frontend (Vite) ────────────────────────────────────────────────────
if frontend_ok; then
  say "✅ Frontend already running on ${FRONTEND_PORT}"
elif port_busy "$FRONTEND_PORT"; then
  fail "Port ${FRONTEND_PORT} is in use but isn't serving ORDOBOOK.
   Inspect with:   lsof -i :${FRONTEND_PORT}
   Or clear it with: ordobook-stop.command"
else
  say "▸  Starting frontend..."
  cd "$PROJECT_DIR/frontend" || fail "Can't find $PROJECT_DIR/frontend"
  nohup npm run dev -- --port "$FRONTEND_PORT" --strictPort \
    >"$LOG_DIR/frontend.log" 2>&1 &
  for _ in $(seq 1 60); do frontend_ok && break; sleep 0.5; done
  frontend_ok || fail "Frontend didn't come up. Check $LOG_DIR/frontend.log"
  say "✅ Frontend started"
fi

# ── 4. Open the app window ────────────────────────────────────────────────
# Chrome's --app mode = no address bar, no tabs, its own dock icon. The separate
# --user-data-dir keeps it fully independent of your everyday Chrome windows.
say "▸  Opening ORDOBOOK..."
open -na "Google Chrome" --args \
  --app="$APP_URL" \
  --user-data-dir="$CHROME_PROFILE" \
  2>/dev/null \
  || fail "Couldn't open Google Chrome. Open $APP_URL manually."

echo ""
echo "  ORDOBOOK is running."
echo "  Logs: $LOG_DIR"
echo "  To shut down cleanly: ordobook-stop.command"
echo "───────────────────────────────────────────"
echo ""
sleep 1
