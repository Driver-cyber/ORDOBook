# NEXT SESSION — Boot Checklist
> Last updated: 2026-09-10 (session close) | Live test cycle on real 2024–2026 data → Batches 1–3 built and
> tested → Red Team (6 items, all resolved). 28 commits. Next: Batch 4, then Batch 5 (data-model change).

---

## Launch (dev, as a desktop app)

Click **ORDOBOOK** in the Dock (or double-click `ORDOBOOK.app` in the project folder). It starts
Postgres/uvicorn/Vite if they aren't running, waits for health, and opens a Chrome app-mode window.
`ordobook-stop.command` shuts the servers down. Ports are fixed at 8000/5173 (Vite proxies `/api`).
**The backend migrates itself to head on every launch** — no manual `alembic upgrade head`.
Rebuild the Dock app after a logo change with `build-app.command`.

Pulling code on the Mac (no merge; branch is `claude/add-project-tracker-zGrFN`):
```
git fetch origin claude/add-project-tracker-zGrFN
git checkout origin/claude/add-project-tracker-zGrFN -- $(git diff --name-only <last-pulled-sha> origin/claude/add-project-tracker-zGrFN)
./ordobook-stop.command    # then relaunch from the Dock
```

## Top priorities

1. **Batch 4 — views & layout.** Workspace → Actuals defaults to the **Actuals History year grid**
   (12 months per screen, year selector, "List View" button beside Review Mapping); **collapsible
   sidebar**; **always-visible horizontal scrollbar** when content overflows; **clickable tooltips
   on every cash-flow driver** (definition + sign convention — write them AFTER Red Team decisions
   #3/#4, which changed what a couple should say); fold the Actuals job-count save/cancel into
   autosave while that screen is rebuilt. (Notes 8/4, 9, 13, 12; Note 18 leftover.)
2. **Batch 5 — Action Plan restructure** (Note 6). Objectives as parent rows (≤3), action items as
   nested sub-rows (≤3 each) with their own owner(s) and due date, multi-owner chips, an owner
   roster editor, wrapping/auto-sizing text, and the advisor-notes popover rendered in front.
   **Data-model change** — plan first, migration, then UI.
3. **Advisor-editable Scoreboard text fields** (carried from May). Headline / priority reason /
   action items as DB-backed fields on the visual Scoreboard, mirrored into the PDF template.
4. **Residual demo items** never exercised live: Reports → Actuals view, Scenario Sandbox, Client
   Profile, PDF + JSON exports. Then Phase 6b (Electron) is unblocked; 6c signing after.
5. **Engine verification vs. the Vetter Jan-2026 workbook** — a systematic diff remains a Module 3
   hard requirement. `backend/scripts/verify_targets.py` now covers the Targets derivation; the
   monthly forecast engine still needs its equivalent.
   Include in that pass: **actuals months do not derive owner draws or capex** (the Forecast
   cash-flow rows show "—" there). Owner activity ≈ Δ equity_before_net_profit (year boundary
   caveat); capex ≈ Δ net fixed assets + depreciation (disposals caveat). Decide, then the
   actuals-month Net Cash Flow can tie to Δ cash.

## Where We Are (2026-09-10)

- Real data: Vetter Plumbing Jan 2024 → Aug 2026 imported (BS, P&L, invoices), all mappings saved.
- **Import:** P&L root cause fixed (QB header order), duplicate accounts merged across files,
  missing/duplicate-report warnings, Cancel Import, grouped canonical-order dropdown.
- **Targets:** full cash-flow drivers (signed, workbook labels), full projected BS with L&E tie-out,
  summary P&L, $/% toggles switching all three columns, per-metric notes (migration 022), autosave +
  undo, **all computed values derived server-side** (migration 024 removed stored copies).
- **Forecast:** autosave + auto-recalculate + undo, $/% toggles on money rows, Total Jobs row,
  Total Payroll display toggle, Tax Savings Reserve retired (migration 023), COS $ pinning (025).
- **Scoreboard:** grades on favourable variance (integer-exact); owner draws graded as signed cash.
  Hit **Recalculate** once to refresh stored grades.
- **Infra:** auto-migrate on launch (dev too), migrations 021–025 idempotent, schema audit + targets
  direction tests in `backend/scripts/`, Dock launcher `.app`, branch merged with main (0 behind).

## Prior session — 2026-05-15 → 2026-05-19 (history)


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

## Step 1 — Launch (historical — see Launch at top; the Dock app replaces the terminals)

## Phase 6 — Electron Packaging (status)

- **6a SQLite migration code: done** and audited (`backend/scripts/audit_schema.py` — migrations and
  models produce identical schemas). Dev still runs Postgres; SQLite activates via `DATABASE_URL`.
- **6b Electron shell: scaffolded, inert** (`electron/`, root `package.json`, `electron-builder.yml`,
  `PHASE-6B-ELECTRON.md` runbook). Auto-migrate on launch, free-port probing, backend serves the
  built SPA. Unblocked once the residual demo items (priority 4) pass.
- **6c signing + auto-update:** after 6b. Electron+Python bundles are an AV false-positive magnet —
  budget for signing before distributing; test on a clean VM.

### Key Constraints Carry Forward
- All API paths: relative `/api/...` — never hardcode localhost
- Monetary values BIGINT cents; monthly driver dicts `dict[str, int]`, keys "1"–"12"
- Pydantic v2: `model_config = {"from_attributes": True}` throughout
- WeasyPrint needs `brew install cairo pango` and must be in the bundled venv (else PDF 503)

---

## Roadmap Order

1. ✅ Phases 3c, 3d, 4, 4a, 4b, 5 (Mar–Apr 2026)
2. ✅ Phase 6a — SQLite migration code (2026-04-24), audited (2026-06-29)
3. ✅ Live test cycle + Batches 1–3 + Red Team (2026-09-10)
4. **Batch 4** — views & layout ← NEXT
5. **Batch 5** — Action Plan restructure (data-model change; plan first)
6. Residual demo items → Phase 6b Electron → 6c signing

---

## Key Notes (carry-forward constraints)

- **Light theme:** DO NOT reintroduce dark hex values (`#1a1d22`, `#0e0f11`, etc.)
- **Overhead is a plug:** `overhead = total_expenses − payroll − marketing − depreciation` — never sum accounts directly
- **`net_profit_for_year` in MonthlyActuals** is QB's cumulative YTD BS equity line — never sum across months
- **`proj_fixed_assets`** must have `max(0, ...)` floor guard — depreciation can exceed prior balance
- **Owner activity is SIGNED cash** (draw negative, investment positive) and is a balance sheet item — it never reduces Net Income. Tax Savings Reserve is retired (folded into draws, migration 023).
- **Net Cash Flow** = Net Profit **+** Owner Investments/(Draws) + CF Asset Changes + CF Liability Changes (owner activity signed; both CF metrics positive-favourable). `cf_*` drivers are signed cash too.
- **Projected equity** = prior equity + Net Profit + owner activity; **Total Liabilities & Equity must equal Total Assets** (tie-out on Targets). The tie-out catches imbalance, NOT sign errors — run `backend/scripts/verify_targets.py` after engine changes.
- **Pydantic v2** — use `model_config = {"from_attributes": True}`, never the v1 `class Config` pattern
- **All API paths** use relative `/api/...` — never hardcode `http://localhost:8000` in frontend
- **Monthly driver dicts** are `dict[str, int]` — string keys "1"–"12", int cents
- **One formula, one place:** Targets' computed values come from `app/engine/targets.py`; the Scoreboard grades against the same derivation. Never store a derivable value.
- **Canonical order** lives in `frontend/src/lib/categories.js` — import it; don't re-order locally. Reports → Actuals is the deliberate exception.
- **COS:** % of revenue unless a month is pinned with a $ entry (`cos_fixed_monthly`); a % entry releases the pin.
- **Grades:** favourable-variance thresholds in integer math (`_compute_grade`); never ratio.
- **Commits:** gate on a script that exits non-zero, `set -e`; no backticks in `-m` strings.
- **Migrations:** literal server defaults via `sa.text()`; compile against the Postgres dialect before pushing — SQLite-only tests missed a Postgres failure that blocked startup (025).

## Tracker Reminder
At session end: update `ordobook-tracker.html` — move completed items to backlog, pull next
priorities up, bump the `"updated"` date in both the visual header and the JSON block.
