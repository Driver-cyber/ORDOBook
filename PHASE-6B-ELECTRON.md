# Phase 6b — Electron Shell (Runbook)

> **Status: scaffolded, NOT yet activated.** These files exist but do nothing to
> your dev workflow until you deliberately run the Electron commands below.
> **Gate:** finish the demo (`DEMO-CHECKLIST.md`) before running this.

This wraps ORDOBOOK into a double-clickable desktop app. In the packaged app the
FastAPI backend serves the built React frontend on a single origin (port 8000),
so the existing relative `/api/...` paths work with no proxy. SQLite (not your
dev Postgres) is used automatically because the bundled app has no `.env`.

---

## What was scaffolded (already in the repo)

| File | Purpose |
|------|---------|
| `package.json` (root) | Electron app metadata + build scripts |
| `electron/main.js` | Starts the backend, waits for health, opens the window, cleans up on quit |
| `electron/preload.js` | Minimal, secure bridge (contextIsolation on) |
| `electron-builder.yml` | Packaging config (bundles `backend/` + `frontend/dist`) |
| `backend/app/main.py` | Now serves the built SPA when `frontend/dist` exists (no-op in dev) |

Your dev workflow is unchanged: two terminals (uvicorn + `npm run dev`) on Postgres.

---

## Prerequisites (on the Mac)

1. Node.js installed (you already have it for the frontend).
2. A backend virtualenv that runs the app: `backend/venv`.
3. Demo passed.

---

## Step 1 — Install Electron tooling (one time)

From the project root:
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
npm install
```
This installs `electron` and `electron-builder` into a root `node_modules/`
(gitignored). It does NOT touch the frontend or backend.

## Step 2 — Smoke-test in dev mode (fastest feedback)

Keep your two normal dev terminals running (uvicorn on 8000, vite on 5173). Then
in a third terminal:
```bash
npm run electron:dev
```
An ORDOBOOK window opens pointed at the Vite server (`localhost:5173`). This
confirms the Electron shell works before dealing with Python bundling. Close it
when done.

## Step 3 — Test the real production path (SQLite + FastAPI-served frontend)

This is the configuration the packaged app will use.

1. Build the frontend:
   ```bash
   npm run build:frontend
   ```
2. Confirm the backend venv can run uvicorn and that SQLite works. Build a fresh
   SQLite DB and sanity-check the schema first:
   ```bash
   cd backend
   source venv/bin/activate
   python scripts/audit_schema.py     # should print PASS
   ```
3. Launch Electron in production mode (loads `localhost:8000`, backend serves the
   built SPA, SQLite DB lands in your app-data dir):
   ```bash
   cd ..
   npm run electron
   ```
   On first run the SQLite DB is empty — you'll re-import the Vetter Plumbing
   QB `.xlsx` files (dev Postgres data does NOT carry over; that's expected).

## Step 4 — Package the .app / .dmg

```bash
npm run dist:mac
```
Output lands in `dist-electron/`.

> **The one thing to verify here:** `electron-builder.yml` bundles `backend/`
> including its `venv`. A venv built on your Mac contains Mac-specific binaries,
> so the resulting `.dmg` runs on Macs but not Windows. Cross-platform builds
> need either a per-OS venv or a PyInstaller binary — decide that when you
> actually need a Windows build (not required for your own use).

---

## Known TODOs (deliberately deferred)

- **Python path in `electron/main.js`** (`pythonBin`) assumes `backend/venv/bin/python`.
  Confirm against the real bundled layout on first `npm run dist`.
- **Code signing + notarization** → Phase 6c (needs Apple Developer account).
- **Auto-updates** (`electron-updater`) → Phase 6c.
- **WeasyPrint** needs system libs (`brew install cairo pango`) AND must be in the
  bundled venv, or PDF export returns 503 in the packaged app.

---

## If something breaks

- **Window opens blank / spinner forever** → backend didn't start. Run the
  backend manually (`cd backend && source venv/bin/activate && uvicorn app.main:app`)
  and watch for errors. The Electron console (View → Toggle Developer Tools)
  shows `[electron]` log lines.
- **`/api` calls 404 in production** → the SPA fallback or static mount didn't
  engage. Confirm `frontend/dist` exists and `ORDOBOOK_FRONTEND_DIST` points at it.
- **DB errors on first launch** → run `python scripts/audit_schema.py`; it must
  print PASS. `create_all` builds the schema on first run, so no `alembic upgrade`
  is needed for a fresh SQLite DB.
