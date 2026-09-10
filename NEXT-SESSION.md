# NEXT SESSION — Boot Checklist
> Last updated: 2026-05-19 (session close) | Scoreboard redesign (Concept 5) + Report Card split shipped. Blank-screen-on-422 fix landed in code but NOT yet validated against the original failure mode — see "Validation pending" below.

---

## Top priorities

1. **Validate the blank-screen fix end-to-end.** The code changes shipped (see "Blank-screen
   fix" section below), build is clean, but the original failure mode — click Confirm on
   `/clients/:id/mapping-review` so the backend returns a 422 — has NOT been re-triggered
   to confirm the page now shows the error text instead of going blank. First task next
   session: do a real import flow on Vetter Plumbing and trip the confirm path. If it shows
   readable error text, the fix is validated and we move on. If it still blanks, debug.
2. **Advisor-editable headline / priority reason / action items.** The new Scoreboard
   currently auto-generates these three text fields. The user explicitly flagged this as
   the highest functional backlog item — they want DB-backed fields so the advisor can
   write the actual narrative for each period. Touches `ScoreboardEntry` (add `priority_reason`,
   `action_item`) plus a new `ScoreboardSummary` row keyed on (client, year) for headline.
   Surface inline-edit UI on the Scoreboard page; mirror the change in
   `_build_scoreboard_template_data` (backend PDF).
3. **Phase 6** — Electron packaging + SQLite migration.

---

## This Session's Work (2026-05-15 → 2026-05-19, single rolling session)

### Scoreboard redesign — Concept 5 ("The Sketch")

Followed the design handoff the user brought back from a separate Claude chat
(`SCOREBOARD-REDESIGN-BRIEF.md` was the outgoing brief; design's `HANDOFF.md` came back).
Single-page 8.5×11 portrait, color-block hybrid: hero tiles → top priorities + action
items → metric-box grid sorted green→yellow→red → 17-cell stoplight strip → footer.

- Renamed data-rich `Scoreboard.jsx` → `ReportCard.jsx`; new route `/reports/report-card/:year`.
- New visual `Scoreboard.jsx` ports Concept 5 — uses existing `GET /scoreboard/:year`,
  cents→dollars adapter, auto-derived headline/reason/actions as placeholders (the DB-backed
  versions are now top backlog).
- Reports tab order: `Actuals | Forecast | Scoreboard | Report Card | Action Plan`.
- Fonts bundled via Fontsource (`@fontsource/syne`, `@fontsource/dm-sans`, `@fontsource/dm-mono`) —
  works offline (Electron-safe). Same woff2s mirrored into `backend/app/templates/fonts/` for
  WeasyPrint PDF rendering.
- Styles live at `frontend/src/styles/scoreboard-{tokens,print}.css` (frontend) and
  `backend/app/templates/scoreboard.css` (backend, concatenated with `@font-face`). Yes, the
  duplication is intentional — frontend Vite needs its copy, WeasyPrint needs its own. Keep
  in sync if the design changes.
- Backend PDF rewritten: Jinja2 template at `backend/app/templates/scoreboard.html.j2`,
  rendered by `_render_scoreboard_html()` in `exports.py`. Reuses `get_scoreboard()` then
  runs `_build_scoreboard_template_data()` adapter. Auto-text helpers (`_auto_headline`,
  `_auto_reason`, `ACTIONS_BY_KEY`) mirror the frontend so PDF and on-screen match.
- Installed `jinja2` + `weasyprint` into the backend venv (they were in `requirements.txt`
  but never actually installed; smoke test caught this).
- Smoke test passed: `GET /api/clients/3/export/pdf/scoreboard/2026 → 200, 27KB PDF`.
  Preview saved at `SCOREBOARD-PREVIEW.pdf` at project root.

### Blank-screen-on-422 fix (code landed, validation pending)

- New `frontend/src/api/errors.js` exports `formatApiError(err, fallback)` — handles array
  detail (joins `loc: msg`), string detail, network errors.
- All four offending `setError(err.response?.data?.detail)` sites now route through it:
  `MappingReview.jsx`, `UploadPage.jsx`, `ClientRoster.jsx`, `ClientProfile.jsx`.
- New `frontend/src/components/ErrorBoundary.jsx` wraps both the `/` route and the
  `ClientLayout` children. Future render crashes show an in-pane fallback (with a "Try again"
  button) instead of unmounting the whole shell.
- **Not yet validated against the original failure path.** The user didn't have time to
  run an import + click Confirm to trigger the 422 and confirm the page now stays mounted
  with readable error text. See top-priorities item #1 above.

### Founding docs

- `ordobook-tracker.html` — header date bumped, priorities renumbered, two new DONE entries
  in the backlog, JSON block updated.
- `MEMORY.md` — Current Status bumped to 2026-05-19; new index entry for the scoreboard split.
- New memory file `project_scoreboard_split.md` captures the non-obvious split (Scoreboard.jsx
  is now the visual one, ReportCard.jsx is the renamed data-rich one) and the font-bundling
  pattern.
- `feedback_api_error_rendering.md` — updated to "FIXED 2026-05-15" but the rule for new code
  is preserved.

---

## Where We Are

Phases 1–5 are fully complete. Migrations 001–021 applied. 13 months of Vetter Plumbing
actuals (Dec 2024–Dec 2025) imported. All deliverable generation (Action Plan, Reports Actuals,
JSON export, PDF export) built and wired. Scoreboard / Report Card split delivered 2026-05-15.
Blank-screen-on-422 blocker fixed 2026-05-15. Next: advisor-editable Scoreboard text fields,
then Phase 6 (Electron + SQLite).

### Completed (chronological)
- Phase 1 ✅ Foundation — client profiles, DB, routing
- Phase 2 ✅ Data Ingestion — QB .xlsx parsing, account mapping, MappingReview UI
- Phase 3a ✅ Engine scaffold — revenue/payroll/overhead engine, Forecast Drivers page
- Phase 3b ✅ Forecast UX, report view, audit trail Level 1, ActualsHistory
- Phase 3c ✅ Cash Flow Drivers — DSO/DIO/DPO, owner draws, projected WC balances
- Phase 3d ✅ Projected Balance Sheet — migration 018, equity = Assets − Liabilities
- Phase 4 ✅ Scoring & Targets — Targets v2 (driver-computed), Scoreboard with grade pills,
  summary banner, max-3-red advisory philosophy, manual grade overrides — migration 019
- Parser hardening ✅ QB ghost column filter, invoice date format fix, abbreviated 2026
  headers ("Jan 2026" → "January 2026"), "As of Dec 31, 2024" normalization
- Phase 4a ✅ Navigation Restructure — WorkspaceShell / ReportsShell / two-space routing / sidebar (confirmed complete 2026-04-23)
- Phase 4b ✅ Scenario Sandbox — ScenarioSandbox.jsx, 3-col inputs, computed results, quarterly toggle, client view, POST /scenario/calculate (confirmed complete 2026-04-23)
- Phase 5 ✅ Deliverable Generation (2026-04-23):
  - Migration 021 + ActionPlanItem model + CRUD API (`/api/clients/:id/action-plan/:year`)
  - ActionPlan.jsx — editable-in-place table, auto-save on blur, private notes popover, year picker, Export JSON + PDF buttons
  - ReportsActuals.jsx — clean BS + P&L at /reports/actuals, period dropdown, replaces ComingSoon
  - JSON export: GET `/api/clients/:id/export/json/:year` — follows CLAUDE.md schema, advisor notes excluded
  - PDF export: GET `/api/clients/:id/export/pdf/:type/:year` (scoreboard | action-plan) via WeasyPrint
  - Export buttons on Scoreboard page (Export JSON + Export PDF)
  - weasyprint + jinja2 added to requirements.txt
  - PDF install: `brew install cairo pango && pip install weasyprint` on Mac
- Build tracker ✅ `ordobook-tracker.html` added 2026-04-22 as cross-project dashboard doc
- Scoreboard redesign ✅ (2026-05-15): Concept 5 visual `Scoreboard.jsx`, data-rich page
  renamed `ReportCard.jsx`, Reports tab order updated, Fontsource fonts bundled, Jinja2
  PDF template at `backend/app/templates/`
- Blank-screen-on-422 fix ✅ (2026-05-15): `frontend/src/api/errors.js` `formatApiError`
  helper, all 4 `setError` sites converted, top-level `ErrorBoundary` wraps routes

---

## Step 1 — Launch

Click **ORDOBOOK** in the Dock. It will:
- Start Postgres via pg_ctl
- Open backend terminal (uvicorn)
- Open frontend terminal (npm run dev)
- Open Chrome to localhost:5173 after 3s

Manual fallback if needed:
```bash
# Postgres (use pg_ctl directly — NOT brew services, stale pid issue)
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 start

# Backend
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
source venv/bin/activate && uvicorn app.main:app --reload

# Frontend
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/frontend"
npm run dev
```

---

## Phase 6 — Electron Packaging (next up)

**Phase 5 is complete** — all deliverables built and wired 2026-04-23.

### Phase 6 build order:

### 1. SQLite Migration
- Change `DATABASE_URL` in `.env` from `postgresql://...` to `sqlite:///path/to/ordobook.db`
- Update `alembic.ini` sqlalchemy.url
- Install `aiosqlite` if needed for async driver
- Run `alembic upgrade head` against SQLite — all migrations should apply cleanly via SQLAlchemy abstraction
- Test data path: `~/Library/Application Support/ORDOBOOK/ordobook.db`

### 2. Electron Shell
- `npm install electron electron-builder --save-dev` in project root
- `main.js` — starts FastAPI backend process on launch, opens browser window to localhost
- `electron-builder.yml` — macOS + Windows targets, bundle Python venv
- Dev mode: separate terminals for uvicorn + vite (unchanged)
- Production: Electron spawns uvicorn with bundled Python

### 3. Code Signing + Distribution
- Apple Developer account required for macOS notarization
- `electron-builder` handles signing if `CSC_LINK` + `APPLE_ID` env vars set
- `electron-updater` for auto-updates via GitHub Releases
- Windows: EV cert or self-signed (self-signed requires user to click through SmartScreen)

### Key Constraints Carry Forward
- All API paths: relative `/api/...` — never hardcode localhost
- SQLite: monetary values BIGINT cents (no change from Postgres)
- Pydantic v2: `model_config = {"from_attributes": True}` throughout
- WeasyPrint PDF requires system libs on user machine: `brew install cairo pango`
- **WeasyPrint installed on Mac** (Python 3.9 system Python, pip3 install, 2026-04-23). If PDF
  export returns 503, the backend venv may need its own install:
  `cd backend && source venv/bin/activate && pip install weasyprint`

---

## Roadmap Order

1. ✅ Phase 3c — full cash flow (2026-03-23)
2. ✅ Phase 3d — Projected Balance Sheet (2026-03-27)
3. ✅ Phase 4 — Targets & Scoring / Scoreboard (2026-03-31)
4. ✅ Phase 4a — Navigation restructure (confirmed 2026-04-23)
5. ✅ Phase 4b — Scenario Sandbox (confirmed 2026-04-23)
6. ✅ Phase 5 — Action Plan + Reports Actuals + PDF/JSON exports (2026-04-23)
7. **Phase 6** — Electron packaging + SQLite migration ← **NEXT**

---

## Key Notes (carry-forward constraints)

- **Light theme:** DO NOT reintroduce dark hex values (`#1a1d22`, `#0e0f11`, etc.)
- **Overhead is a plug:** `overhead = total_expenses − payroll − marketing − depreciation` — never sum accounts directly
- **`net_profit_for_year` in MonthlyActuals** is QB's cumulative YTD BS equity line — never sum across months
- **`proj_fixed_assets`** must have `max(0, ...)` floor guard — depreciation can exceed prior balance
- **Owner draws / tax savings** are balance sheet items — do NOT reduce Net Income
- **Net Cash Flow** = Net Profit − Owner Draws + CF Asset Changes + CF Liability Changes (both CF metrics positive-favorable)
- **Projected equity** = Total Assets − Total Liabilities (not from equity_before_net_profit)
- **Pydantic v2** — use `model_config = {"from_attributes": True}`, never the v1 `class Config` pattern
- **All API paths** use relative `/api/...` — never hardcode `http://localhost:8000` in frontend
- **Monthly driver dicts** are `dict[str, int]` — string keys "1"–"12", int cents

## Tracker Reminder
At session end: update `ordobook-tracker.html` — move completed items to backlog, pull next
priorities up, bump the `"updated"` date in both the visual header and the JSON block.
