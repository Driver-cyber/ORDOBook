#!/bin/bash
# ORDOBOOK Dev Launcher
# Opens backend and frontend in separate Terminal tabs

PROJECT_DIR="/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"

# Start Postgres if not running
if ! pg_isready -q 2>/dev/null; then
  echo "Starting PostgreSQL..."
  sudo -u cstewch /opt/homebrew/opt/postgresql@17/bin/pg_ctl \
    -D /opt/homebrew/var/postgresql@17 start 2>/dev/null || true
  sleep 1
fi

# Open Terminal with two tabs
osascript <<EOF
tell application "Terminal"
  -- Tab 1: Backend
  do script "echo '🔧 ORDOBOOK Backend'; cd '$PROJECT_DIR/backend' && source venv/bin/activate && uvicorn app.main:app --reload"
  set frontWindow to front window

  -- Tab 2: Frontend
  tell frontWindow
    set newTab to (do script "echo '⚡ ORDOBOOK Frontend'; cd '$PROJECT_DIR/frontend' && npm run dev")
  end tell

  activate
end tell
EOF

echo "ORDOBOOK dev servers launching..."
