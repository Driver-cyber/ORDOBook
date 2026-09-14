#!/bin/bash
#
# ORDOBOOK Update — double-click (or run) to pull the latest build and relaunch.
#
# Does the three steps in the only safe order:
#   1. STOP the servers. The backend runs with --reload, so pulling files while
#      it is up makes it restart mid-pull on a half-updated tree — that is how
#      launches have been breaking.
#   2. PULL: fetch the branch and check out only the files that changed since
#      the last update (remembered in .ordobook-last-pull), removing files the
#      branch deleted. No merge, no touching your local main.
#   3. LAUNCH: the normal launcher, which migrates the database and opens the
#      window.
#
# Pass --dry-run to see what would be pulled without touching anything.

set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_DIR="/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
BRANCH="claude/add-project-tracker-zGrFN"
STAMP=".ordobook-last-pull"

say()  { printf "  %s\n" "$1"; }
fail() {
  printf "\n❌ %s\n\n" "$1"
  if [ -t 0 ]; then read -r -p "Press Return to close..." _; fi
  exit 1
}

cd "$PROJECT_DIR" || fail "Can't find $PROJECT_DIR"
echo ""
echo "── Updating ORDOBOOK ──────────────────────"

# ── 1. Stop ────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--dry-run" ]; then
  ./ordobook-stop.command
fi

# ── 2. Pull ────────────────────────────────────────────────────────────────
say "▸  Fetching $BRANCH..."
for attempt in 1 2 3 4; do
  git fetch -q origin "$BRANCH" && break
  [ "$attempt" = 4 ] && fail "Couldn't fetch from GitHub. Check your connection and try again."
  sleep $((attempt * 2))
done
REMOTE="origin/$BRANCH"
NEW_SHA=$(git rev-parse "$REMOTE")

if [ -f "$STAMP" ] && git cat-file -e "$(cat "$STAMP")" 2>/dev/null; then
  BASE=$(cat "$STAMP")
else
  # First run: diff against what's on disk so nothing that differs is missed.
  BASE="HEAD"
fi

if [ "$BASE" = "$NEW_SHA" ]; then
  say "✅ Already up to date ($(git rev-parse --short "$NEW_SHA"))"
else
  CHANGED=$(git diff --name-only --diff-filter=ACMRT "$BASE" "$REMOTE")
  DELETED=$(git diff --name-only --diff-filter=D "$BASE" "$REMOTE")
  COUNT=$(printf "%s\n" "$CHANGED" | sed '/^$/d' | wc -l | tr -d ' ')
  say "▸  $COUNT file(s) changed since $(git rev-parse --short "$BASE"):"
  printf "%s\n" "$CHANGED" | sed '/^$/d' | sed 's/^/       /'
  if [ -n "$DELETED" ]; then
    say "▸  removed on the branch:"
    printf "%s\n" "$DELETED" | sed 's/^/       /'
  fi
  if [ "${1:-}" = "--dry-run" ]; then
    echo ""; say "(dry run — nothing changed)"; echo ""; exit 0
  fi
  if [ -n "$CHANGED" ]; then
    printf "%s\n" "$CHANGED" | sed '/^$/d' | tr '\n' '\0' | xargs -0 git checkout "$REMOTE" -- \
      || fail "git checkout failed — nothing was launched. Run this script again, or ask for help with the message above."
  fi
  if [ -n "$DELETED" ]; then
    printf "%s\n" "$DELETED" | tr '\n' '\0' | xargs -0 rm -f
  fi
  # New migrations mean the backend will migrate on launch — say so, it's the
  # step people wait on.
  if printf "%s\n" "$CHANGED" | grep -q "^backend/alembic/versions/"; then
    say "•  New database migration(s) — the backend applies them on launch; watch for 'schema ready' in backend.log"
  fi
  say "✅ Pulled $(git rev-parse --short "$NEW_SHA")"
fi
echo "$NEW_SHA" > "$STAMP"

# ── 3. Launch ──────────────────────────────────────────────────────────────
echo ""
exec ./ordobook.command
