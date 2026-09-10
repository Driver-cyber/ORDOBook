#!/bin/bash
#
# Builds ORDOBOOK.app — a real macOS app bundle you can drop in the Dock or
# Applications folder. Clicking it starts Postgres/backend/frontend (reusing
# anything already running) and opens the ORDOBOOK window.
#
# Run this once. Re-run it any time you want to rebuild (e.g. new logo).
# Uses only macOS built-ins (sips, iconutil) — nothing to install.

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

rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources" \
  || fail "Couldn't create the app bundle."

# ── Info.plist ────────────────────────────────────────────────────────────
cat > "$APP_PATH/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>              <string>ORDOBOOK</string>
  <key>CFBundleDisplayName</key>       <string>ORDOBOOK</string>
  <key>CFBundleIdentifier</key>        <string>com.ordo.ordobook.launcher</string>
  <key>CFBundleVersion</key>           <string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleExecutable</key>        <string>ORDOBOOK</string>
  <key>CFBundleIconFile</key>          <string>ORDOBOOK</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>LSMinimumSystemVersion</key>    <string>11.0</string>
  <key>NSHighResolutionCapable</key>   <true/>
</dict>
</plist>
PLIST
say "✅ Info.plist"

# ── Executable (delegates to the launcher script) ─────────────────────────
cat > "$APP_PATH/Contents/MacOS/${APP_NAME}" <<EXEC
#!/bin/bash
exec "${LAUNCHER}"
EXEC
chmod +x "$APP_PATH/Contents/MacOS/${APP_NAME}" || fail "Couldn't make the app executable."
say "✅ Executable"

# ── Icon (logo.png -> .icns via macOS built-ins) ──────────────────────────
ICONSET="$(mktemp -d)/${APP_NAME}.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$LOGO" \
    --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1
  sips -z "$((size * 2))" "$((size * 2))" "$LOGO" \
    --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1
done
iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/${APP_NAME}.icns" 2>/dev/null \
  || fail "Icon conversion failed. The app still works — it'll just use a generic icon."
rm -rf "$(dirname "$ICONSET")"
say "✅ Icon"

# Nudge Finder to pick up the new icon rather than a cached one.
touch "$APP_PATH"

echo ""
echo "  Built: $APP_PATH"
echo ""
echo "  Next:"
echo "    1. Open the ORDOBook folder in Finder"
echo "    2. Drag ORDOBOOK.app to your Dock (or into /Applications first)"
echo "    3. First launch: right-click -> Open -> Open (unsigned app, one time only)"
echo "───────────────────────────────────────────"
echo ""
sleep 1
