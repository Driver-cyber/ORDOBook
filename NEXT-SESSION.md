# NEXT SESSION — Boot Checklist
> Last updated: 2026-04-23 | Phase 5 complete, Phase 6 (Electron packaging) is next

---

## Where We Are

Phases 1–5 are fully complete. Migrations 001–021 applied. 13 months of Vetter Plumbing
actuals (Dec 2024–Dec 2025) imported. All deliverable generation (Action Plan, Reports Actuals,
JSON export, PDF export) built and wired. Phase 6 (Electron packaging + SQLite migration) is next.

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
