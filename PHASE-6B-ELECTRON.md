# Phase 6b — Electron Shell (Runbook)

> **Status: scaffolded, NOT yet activated.** These files exist but do nothing to
> your dev workflow until you deliberately run the Electron commands below.
> **Gate:** finish the demo (`DEMO-CHECKLIST.md`) before running this.

This wraps ORDOBOOK into a double-clickable desktop app. In the packaged app the
FastAPI backend serves the built React frontend on a single origin (an auto-probed
free port), so the existing relative `/api/...` paths work with no proxy. SQLite
(not your dev Postgres) is used automatically because the bundled app has no `.env`.

---

## ⚠️ Two rules to package by (hard-won on a prior Tauri/Electron project)

1. **"Green build ≠ works."** A successful CI/`electron-builder` run only proves the
   config parsed and the code compiled. It does NOT prove the embedded Python
   backend launches, binds its port, and answers `/api/health` on a real machine.
   **Always install and actually exercise the app** — import a file, watch the DB
   appear in the app-data dir — before calling a build good.
2. **Test on a truly clean machine/VM**, not your dev box. Your Mac already has the
   Python runtime, the venv, unblocked files, and no Gatekeeper friction. A user's
   machine has none of that. The download-and-run experience is invisible from the
   dev box — so test it explicitly (this is doubly true for signing, see 6c).

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
3. Launch Electron in production mode (backend serves the built SPA on an
   auto-probed free port, SQLite DB lands in your app-data dir):
   ```bash
   cd ..
   npm run electron
   ```
   On first run the SQLite DB is empty — you'll re-import the Vetter Plumbing
   QB `.xlsx` files (dev Postgres data does NOT carry over; that's expected).
   > The backend port is **not hardcoded** — `electron/main.js` probes for a free
   > one at launch, so a stray uvicorn or another app on 8000 can't block startup.

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

## Your data persists across versions (patch → re-package → ship)

The SQLite database lives in the OS app-data dir
(`~/Library/Application Support/ORDOBOOK/ordobook.db`), **outside** the `.app`
bundle. Re-installing a new `.dmg` replaces the program, not your data — clients,
imports, targets, and action plans all carry over. You re-import from zero only
once, on the very first packaged launch.

Schema changes are handled automatically: the packaged app runs
`alembic upgrade head` on every launch (`ORDOBOOK_AUTO_MIGRATE=1`, set by
Electron; see `backend/app/db_migrate.py`). So a new version that adds a column
applies that migration to your existing DB without losing rows. The patch loop is:

1. Edit + test in dev mode (Postgres, hot reload) — unchanged workflow.
2. Add an Alembic migration for any schema change (as you already do).
3. `npm run dist:mac` to cut the new version.
4. Install it — your data is intact, the new migration applies on first launch.

> Tested: a DB at migration 020 with existing rows upgrades to 021 on launch with
> all rows preserved and the new table added. Run `python scripts/audit_schema.py`
> before packaging to confirm the migration chain is clean.

---

## Known TODOs (deliberately deferred)

- **Python path in `electron/main.js`** (`pythonBin`) assumes `backend/venv/bin/python`.
  Confirm against the real bundled layout on first `npm run dist`.
- **Code signing + notarization** → Phase 6c (needs Apple Developer account, ~$99/yr
  for macOS notarization). ⚠️ Budget for this *before* distributing, not at it:
  Electron + embedded-Python bundles are bigger and a **known antivirus / SmartScreen
  false-positive magnet** (worse than a tiny signed native app). "It runs on my dev
  box" hides all of it — the clean-VM test above is where you'll actually see it.
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
