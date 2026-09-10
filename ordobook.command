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

# Launches from Finder/Dock inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin)
# that has no Homebrew — so npm/node wouldn't be found. Add the usual Homebrew
# locations explicitly so this behaves the same from Terminal or the Dock.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

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

# Errors need to surface differently depending on how we were launched:
# from Terminal there's a TTY to print to; from the Dock .app there isn't, so
# fall back to a macOS alert dialog or the failure would be silent.
fail() {
  local msg="$1"
  printf "\n❌ %s\n\n" "$msg"
  if [ -t 0 ]; then
    read -r -p "Press Return to close..." _
  else
    local safe="${msg//\"/\'}"
    osascript -e "display alert \"ORDOBOOK couldn't start\" message \"${safe}\" as critical" \
      >/dev/null 2>&1
  fi
  exit 1
}

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
  # --reload so backend edits take effect without restarting the app (this is
  # still a dev-mode launcher, not a packaged build).
  nohup ./venv/bin/uvicorn app.main:app --port "$BACKEND_PORT" --reload \
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
# If a window from a previous launch is still open, bring it forward instead of
# spawning a second one. If NO window is open but the profile still carries a lock
# from a crashed/killed Chrome, a fresh launch hands the URL to a ghost and nothing
# appears — so clear stale locks before opening.
say "▸  Opening ORDOBOOK..."
if pgrep -f "user-data-dir=$CHROME_PROFILE" >/dev/null 2>&1; then
  osascript -e 'tell application "Google Chrome" to activate' >/dev/null 2>&1 || true
  say "•  ORDOBOOK window was already open — brought it forward"
else
  rm -f "$CHROME_PROFILE"/Singleton* 2>/dev/null
  open -na "Google Chrome" --args \
    --app="$APP_URL" \
    --user-data-dir="$CHROME_PROFILE" \
    2>/dev/null \
    || fail "Couldn't open Google Chrome. Open $APP_URL manually."
fi

echo ""
echo "  ORDOBOOK is running."
echo "  Logs: $LOG_DIR"
echo "  To shut down cleanly: ordobook-stop.command"
echo "───────────────────────────────────────────"
echo ""
sleep 1
