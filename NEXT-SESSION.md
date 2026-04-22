# NEXT SESSION — Boot Checklist
> Last updated: 2026-04-22 | Phase 4 complete (019), nav architecture decided, tracker added

---

## Where We Are

Phases 1–4 are fully complete. Migrations 001–019 applied. 13 months of Vetter Plumbing
actuals (Dec 2024–Dec 2025) imported. Nav architecture for Phase 4a decided and logged.

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
- Nav architecture ✅ Two-space model decided 2026-04-05 (implementation still pending)
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

## Phase 4a — Navigation Restructure (first up)

**Decision:** ORDOBOOK's primary navigation is two spaces:

**Workspace** (analyst density — the advisor does the work here):
- Actuals tab — working view + Import button
- Forecast Drivers tab — 13-column editable model
- Targets tab — annual targets with driver-computed fields

**Reports** (client-presentation clean — what gets produced and shared):
- Actuals tab — clean BS + P&L
- Forecast tab — 12-month combined actuals + forecast
- Scoreboard tab — 1-page red/yellow/green dashboard
- Action Plan tab — editable-in-place structured report

**Routes to implement:**
```
/clients/:id/workspace/actuals
/clients/:id/workspace/forecast
/clients/:id/workspace/targets

/clients/:id/reports/actuals
/clients/:id/reports/forecast
/clients/:id/reports/scoreboard
/clients/:id/reports/action-plan
```

**Sidebar:** Two primary links (Workspace, Reports) + persistent Import shortcut.
Scoreboard moves OUT of workspace cards → INTO Reports tabs.

---

## Roadmap Order

1. ✅ Phase 3c — full cash flow (2026-03-23)
2. ✅ Phase 3d — Projected Balance Sheet (2026-03-27)
3. ✅ Phase 4 — Targets & Scoring / Scoreboard (2026-03-31)
4. **Phase 4a** — Navigation restructure ← **NEXT**
5. Phase 4b — Scenario Sandbox
6. Phase 5 — PDF + JSON exports + Action Plan editor
7. Phase 6 — Electron packaging + SQLite migration

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
