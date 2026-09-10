#!/bin/bash
#
# Builds ORDOBOOK.app — a real macOS app bundle you can drop in the Dock or
# Applications folder. Clicking it starts Postgres/backend/frontend (reusing
# anything already running) and opens the ORDOBOOK window.
#
# Run this once. Re-run any time you want to rebuild (e.g. new logo).
# Uses only macOS built-ins (osacompile, sips, iconutil) — nothing to install.
#
# Why osacompile instead of hand-building the bundle: an .app whose executable
# is a plain shell script has no Mach-O header, so Apple Silicon can't tell its
# architecture and prompts to install Rosetta. osacompile emits a proper native
# universal binary that runs our script, so no Rosetta prompt.

set -uo pipefail

PROJECT_DIR="/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
APP_NAME="ORDOBOOK"
APP_PATH="${PROJECT_DIR}/${APP_NAME}.app"
LOGO="${PROJECT_DIR}/frontend/src/assets/logo.png"
LAUNCHER="${PROJECT_DIR}/ordobook.command"

say()  { printf "  %s\n" "$1"; }
fail() { printf "\n❌ %s\n\n" "$1"; read -r -p "Press Return to close..." _; exit 1; }

echo ""
echo "── Building ORDOBOOK.app ──────────────────"

[ -f "$LAUNCHER" ] || fail "Can't find ordobook.command at $LAUNCHER"
[ -f "$LOGO" ]     || fail "Can't find the logo at $LOGO"
chmod +x "$LAUNCHER" 2>/dev/null

rm -rf "$APP_PATH"

# ── Build a native app that runs the launcher ─────────────────────────────
# The launcher path is single-quoted inside the AppleScript string so the
# spaces in "ORDO Projects" survive.
osacompile -o "$APP_PATH" \
  -e "do shell script \"'${LAUNCHER}' >/dev/null 2>&1\"" \
  || fail "osacompile failed — couldn't build the app bundle."
say "✅ App bundle (native, no Rosetta needed)"

# ── Icon (logo.png -> .icns via macOS built-ins) ──────────────────────────
# osacompile names its icon applet.icns and references that in Info.plist,
# so we overwrite that file rather than adding a new one.
TMPDIR_ICON="$(mktemp -d)"
ICONSET="${TMPDIR_ICON}/${APP_NAME}.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$LOGO" \
    --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1
  sips -z "$((size * 2))" "$((size * 2))" "$LOGO" \
    --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1
done

if iconutil -c icns "$ICONSET" -o "${TMPDIR_ICON}/${APP_NAME}.icns" 2>/dev/null; then
  cp "${TMPDIR_ICON}/${APP_NAME}.icns" "$APP_PATH/Contents/Resources/applet.icns"
  say "✅ Icon"
else
  say "⚠️  Icon conversion failed — app works, it'll just use the default icon."
fi
rm -rf "$TMPDIR_ICON"

# Nudge Finder to pick up the new icon rather than a cached one.
touch "$APP_PATH"

echo ""
echo "  Built: $APP_PATH"
echo ""
echo "  Next:"
echo "    1. Open the ORDOBook folder in Finder"
echo "    2. Drag ORDOBOOK.app to your Dock (or into /Applications first)"
echo "    3. First launch: right-click -> Open -> Open (unsigned app, one time only)"
echo ""
echo "  If macOS still mentions Rosetta, click Not Now and tell me."
echo "───────────────────────────────────────────"
echo ""
sleep 1
