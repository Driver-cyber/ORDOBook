# DECISIONS.md — ORDOBOOK Decision Log

> **Purpose:** This file tracks confirmed decisions — things we have agreed on and
> can move forward with. It is distinct from brainstorming. If it's in here, it's decided.
> Update this file after every significant pivot or completed module.

---

## 🎯 Current North Star

**Build a cloud-hosted financial advisory workflow application** that replaces the manual
Excel workbook process for a solo consulting practice. The immediate goal is to automate
monthly bookkeeping data ingestion from QuickBooks Online exports, run the analytical
models, and produce the Scoreboard, 12-Month Forecast, and Action Plan deliverables.

**Current Phase:** Phase 4 complete (2026-03-31). Targets v2 + Scoreboard live. Migrations 001–019 applied.
13 months of Vetter Plumbing actuals (Dec 2024–Dec 2025) imported.
Navigation architecture decided (2026-04-05) — implementation pending.
**Next:** Nav restructure → Phase 4b (Scenario Sandbox) → Phase 5 (PDF/JSON exports + Action Plan).

**Current Vibe:** Deliberate. Plan before building. Verify before shipping. One module at a time.

---

## 🛠 Active Tech Stack

| Component | Decision | Status |
|---|---|---|
| Desktop Framework | Electron + electron-builder | ✅ Decided (2026-03-05) |
| Frontend | React (Vite) | ✅ Decided |
| Backend | Python (FastAPI) embedded | ✅ Decided |
| Database | SQLite (via SQLAlchemy) | ✅ Decided (2026-03-05) — replaces PostgreSQL |
| ~~Hosting~~ | ~~Railway or Render~~ | ❌ Superseded — local-first desktop app |
| Styling | Tailwind CSS | ✅ Decided |
| File Parsing | pandas + openpyxl | ✅ Decided |
| PDF Generation | WeasyPrint | ✅ Decided |
| State Management | React Context (simple, no Redux) | ✅ Decided |

---

## 📋 Confirmed Scope Decisions

### In Scope (v1)
- Client roster and profile management
- QuickBooks Online Excel (.xlsx) export ingestion
- Per-client account mapping with review/override UI
- Actuals data model (Balance Sheet, P&L, transaction counts)
- Analytical engine: Revenue model, Overhead, Payroll → 12-Month Forecast
- Manual override interface for forecast drivers
- Annual targets per client
- Green / Yellow / Red performance grading
- Scoreboard view and PDF export
- 12-Month Forecast PDF export
- Action Plan structured editor and PDF export
- What If / Scenario modeling (Phase 4, non-blocking)
- Structured JSON output for all deliverables (forward compatibility with Phase 2)

### Explicitly Out of Scope (v1)
| Feature | Decision Date | Reason |
|---|---|---|
| Tax Projection module | 2026-02-24 | Too non-standard, too much logic lives in consultant's head; separate project |
| Conversion Rate tracking | 2026-02-24 | Unused in current workflow, deprioritized |
| Retention Rate tracking | 2026-02-24 | Unused in current workflow, deprioritized |
| Client-facing portal / dashboard | 2026-02-24 | Phase 2 product (separate project) |
| Blockchain / distributed ledger | 2026-02-24 | Version 3-5 concept, no current practical path |
| Action Plan completion tally | 2026-02-24 | Phase 2 feature, noted for future design |
| Multi-user admin UI | 2026-02-24 | Solo user for now; data model supports it, UI deferred |
| QuickBooks API integration | 2026-02-24 | Phase 3 enhancement; ingestion layer designed to support it without rebuild |

---

## 📐 Architecture Decisions

### [2026-03-05] Application Type: Local-first desktop application ← CURRENT
**Decision:** Build ORDOBOOK as a local-first desktop application using Electron, not a cloud-hosted web app.
**Reason:**
- **Privacy & Security:** Client financial data never leaves the advisor's machine unless explicitly exported
- **Product positioning:** "Your data stays on your device" is a competitive advantage for financial advisors
- **Offline capability:** Works without internet, no server downtime scenarios
- **Performance:** No network latency, instant QB file parsing and forecast updates
- **Cost:** No monthly hosting fees
- **Distribution:** Better suited for selling to other accountants (one-time or annual license vs. SaaS)

**Architectural implications:**
- Electron desktop framework instead of Railway/Render deployment
- Embedded FastAPI server (starts with app launch, runs locally on a loopback port)
- SQLite instead of PostgreSQL (single-file database in Application Support folder)
- All PDF generation happens locally via WeasyPrint
- Auto-update mechanism via electron-updater; code signing for macOS distribution
- Dev note: Current dev setup continues to use PostgreSQL for convenience — migration to SQLite happens when Electron packaging begins. SQLAlchemy makes this a contained change.

### [2026-03-05] Product Split: ORDOBOOK (Desktop) vs. Cloud Platform (Product 2)
**Decision:** ORDOBOOK is Product 1. A separate cloud SaaS (Product 2, name TBD) will be built *after* ORDOBOOK v1 ships, providing live client dashboards, AI chatbot, and 24/7 client engagement tools.
**Reason:** Clear product boundaries. ORDOBOOK = advisor's private workspace. Cloud Platform = client engagement layer. Advisors can use ORDOBOOK standalone forever — no forced cloud dependency. Better business model: desktop license + optional cloud subscription sold separately.
**What this means:**
- Do not build Product 2 features in ORDOBOOK
- JSON export format is the *only* connection point between products
- Meeting Mode is screen-share UI — clients never log into ORDOBOOK directly
- No ORDOBOOK feature should assume cloud product exists

### [2026-03-05] Data Storage: SQLite in Application Support folder
**Decision:** All data stored locally in SQLite at `~/Library/Application Support/ORDOBOOK/ordobook.db` (macOS) / `%APPDATA%/ORDOBOOK/ordobook.db` (Windows).
**Reason:** Standard OS location for app data. SQLite is single-file, portable, zero-config. Easy user backup (copy one file). SQL is SQL — minimal ORM changes from current PostgreSQL dev setup.

### [2026-02-24] ~~Application Type: Cloud-hosted web app~~ — SUPERSEDED
~~**Decision:** Build as a cloud-hosted web application, not a local/desktop app.~~
**SUPERSEDED 2026-03-05:** Pivoted to local-first desktop application. See decision above.

### [2026-02-24] Organization: Client-first, then chronological
**Decision:** The primary navigation hierarchy is Client → Year → Month.
**Reason:** The user's mental model of the work is "I'm working on [Client] for [Month]."
This should be the application's organizing principle.

### [2026-02-24] Account Mapping: Per-client, persistent, reviewed on first upload
**Decision:** On first upload for a new client, the app auto-maps QB accounts and presents
them for review/override. The confirmed mapping is saved to the client profile and applied
automatically to all future uploads.
**Reason:** QuickBooks account names vary between clients (different bank accounts, asset
categories, etc.). A rigid universal mapping would break. A per-client mapping accommodates
variation without requiring manual work every month.

### [2026-02-24] Analytical Engine: One engine, client-specific drivers
**Decision:** All clients share the same underlying calculation engine. Client differences
are handled through configuration (different overhead line items, different revenue drivers),
not different code paths.
**Reason:** Maintaining multiple engines would be unmaintainable. The variation between
clients is in parameters, not in the fundamental financial logic.

### [2026-02-24] Financial Math: Python decimal module
**Decision:** All financial calculations use Python's `decimal` module, not floating point.
**Reason:** Floating point arithmetic produces rounding errors in financial contexts.
Non-negotiable.

### [2026-02-24] Reference Test Case: Vetter Plumbing, January 2026
**Decision:** The Vetter Plumbing January 2026 workbook is the canonical reference for
verifying the analytical engine's outputs. Module 3 is not complete until its outputs
match the reference workbook for the same inputs.

### [2026-02-24] Forward Compatibility: Structured JSON outputs
**Decision:** All deliverable data (Scoreboard, Forecast, Action Plan) must be exportable
as structured, versioned JSON in addition to PDF.
**Reason:** Phase 2 (client dashboard / Virtual CFO) will ingest these outputs. Building
the JSON structure now avoids a future migration.

### [2026-02-24] Audit Trail & God Mode: Three-level drill-down, required from day one
**Decision:** Every calculated value displayed in the UI must have a fully traceable source
chain. This is implemented as three levels of visibility:
- **Level 1 — Hover popover:** Top-level formula shown on hover (e.g., "27 jobs × $2,192 = $59,178")
- **Level 2 — Expanded panel:** One click reveals full component breakdown — every line item,
  its source (Actual / Forecast driver / Manual override), and the period it came from
- **Level 3 — God Mode:** Full-screen toggle that transforms the workspace into a structured
  editable view of all drivers and intermediate calculations. Color-coded by source type.
  Changes to any driver update all downstream numbers in real time. Toggle off to return
  to clean presentation view.

**Architectural requirement:** The analytical engine must store all intermediate calculation
steps, not just final outputs. A number that cannot be traced to its inputs will not be
displayed. This is non-negotiable and must be designed into Phase 3 from the start.

**Reason:** "A number I can't trace is a number I can't trust." The primary user is an
auditor. Opacity in financial calculations is a product failure, not a cosmetic issue.

### [2026-02-24] Transition Strategy: Cold turkey, no migration tooling needed
**Decision:** The advisor will transition directly to ORDOBOOK for real clients as soon
as the tool is ready. No parallel Excel/ORDOBOOK period. No migration of existing workbooks.
The Vetter Plumbing January 2026 workbook serves only as the development reference test case.
**Reason:** Low risk — advisor can rebuild an Excel workbook in hours if needed. Clean break
preferred over complicated parallel operation.

### [2026-02-24] Scenario Sandbox: Replaces What If column + 5-Year Plan tab
**Decision:** What If modeling and multi-year planning are combined into a single Scenario
Sandbox module rather than two separate features.
**Reason:** Both serve the same purpose — connecting a number to a real-world decision.
The 5-Year Plan as a precision forecast is not useful; as a scenario conversation tool it is.
Scenarios are strictly isolated from the working forecast; no scenario ever overwrites actuals.

### [2026-02-24] Meeting Mode: Quiet toggle in app menu, not prominent UI
**Decision:** Meeting Mode is a mode toggle accessible from the application menu —
same pattern as God Mode. Not a prominent button on the workspace.
**What it does:** Distraction-free view showing last month's Action Plan (with checkboxes)
on the left and a live Action Plan editor on the right. Nothing else. "End Meeting" saves draft.
**Reason:** Only needed ~1 hour per month. Should be easy to find, impossible to trigger
accidentally while doing other work.

### [2026-02-24] Advisor Context Layer: Private notes per client, never exported
**Decision:** Each client profile includes a private advisor notes field — soft context
about the client's energy, personal pressures, goals beyond the numbers, things to revisit.
This field never appears in any client-facing export or PDF.
**Reason:** The advisory value is in the human conversation the data enables. The advisor
should never walk into a meeting cold. Financial data alone is half the picture.
**Decision:** The data ingestion layer is abstracted behind a clean interface so that
swapping from "parse uploaded Excel" to "fetch from QB API" is a contained change.
The API integration itself is deferred to Phase 3.

---

## 🗓 Build Phases

| Phase | Focus | Est. Duration | Status |
|---|---|---|---|
| 1 | Foundation: project setup, hosting, DB, client profiles | Weeks 1-4 | ✅ Complete & verified (2026-03-04) |
| 2 | Data Ingestion: QB export parsing, account mapping, Actuals | Weeks 5-10 | ✅ Complete & verified (2026-03-05) |
| 3a | Analytical Engine scaffold: data model, engine modules, API, Forecast Drivers page | Weeks 11-14 | ✅ Complete (2026-03-09) |
| 3b | Forecast UX, report view, audit trail Level 1, Actuals History | Weeks 15-18 | ✅ Complete |
| 3c | Cash Flow Drivers: DSO/DIO/DPO, owner draws, projected balances, full cash flow | Weeks 19-21 | ✅ Complete (2026-03-23, migration 017) |
| 3d | Projected Balance Sheet: cash, fixed assets, total assets, liabilities, equity | — | ✅ Complete (2026-03-27, migration 018) |
| 4 | Scoring & Targets: Targets UI, grading, Scoreboard | — | ✅ Complete (2026-03-31, migration 019) |
| 4a | Navigation restructure: Workspace + Reports two-space model | — | 🔜 Decided, implementation pending |
| 4b | Scenario Sandbox | — | 🔜 Not started |
| 5 | Deliverable Generation: PDF exports, Action Plan editor, JSON outputs | — | 🔜 Not started |

---

## 📦 Phase 1 — Implementation Decisions (2026-03-04)

### [2026-03-04] Monorepo structure: backend/ + frontend/ in one repo
**Decision:** Single git repository with `backend/` and `frontend/` as subdirectories.
**Reason:** Simplest for a solo developer. No cross-repo coordination overhead.
One place to find everything.

### [2026-03-04] Backend: FastAPI + SQLAlchemy 2.0 + Alembic + psycopg2-binary
**Decision:** FastAPI for the API layer, SQLAlchemy ORM (v2 declarative style) for the database
layer, Alembic for migrations, psycopg2-binary as the PostgreSQL driver.
**Reason:** Matches CLAUDE.md stack. FastAPI provides automatic OpenAPI docs, async-ready,
and native Pydantic integration. SQLAlchemy 2.0 style is cleaner and more explicit than legacy.

### [2026-03-04] Backend runs migrations via `alembic upgrade head`; tables also auto-created on startup
**Decision:** `Base.metadata.create_all()` is called in `main.py` as a safety net for development.
Alembic handles the canonical migration path.
**Reason:** Prevents a blank startup failure during initial setup before the developer has run
Alembic. Will be removed or gated behind an environment variable before production deployment.

### [2026-03-04] Frontend: Vite proxy eliminates CORS complexity in development
**Decision:** All `/api/*` requests from the React frontend are proxied to `localhost:8000`
via Vite's built-in proxy. CORS middleware is still configured in FastAPI for production.
**Reason:** Avoids the "blocked by CORS policy" error that trips up new setups.
Both browser and API server see requests as same-origin during development.

### [2026-03-04] Terminology config stored as JSONB, not normalized columns
**Decision:** `terminology_config` is a JSONB column on the `clients` table rather than a
separate lookup table.
**Reason:** The set of terminology fields is small and client-specific. Normalizing it into
rows would add query complexity with no benefit at this scale. JSONB is flexible enough to
accommodate new terminology keys without a migration.

### [2026-03-04] Advisor notes: single text field, never in any API response used for export
**Decision:** `advisor_notes` is a plain text field returned by the API but explicitly marked
private in the UI. Phase 2 export logic must explicitly exclude this field.
**Note:** When building PDF/JSON export in Phase 5, ensure `advisor_notes` is excluded from
all serialization paths. The API returning it is fine — the export layer must filter it.

### [2026-03-04] Design tokens: CSS custom properties defined in Tailwind config, not inline
**Decision:** The mockup's CSS variables (`--bg`, `--surface`, `--accent`, etc.) are mapped
to Tailwind theme colors (`bg`, `surface`, `accent`, etc.) so they can be used as utility classes.
**Reason:** Consistency. All color usage goes through Tailwind; no inline style exceptions.
Green/yellow/red grade colors are namespaced as `grade-green`, `grade-yellow`, `grade-red`
to make it structurally impossible to accidentally use them decoratively.

### [2026-03-04] Fonts: DM Sans + DM Mono + Syne loaded via Google Fonts in index.html
**Decision:** Fonts loaded via `<link>` in `index.html`, not bundled.
**Reason:** Simplest approach for now. If offline use or performance becomes a concern,
swap to self-hosted via `@fontsource` packages without touching component code.

---

## 📦 Phase 2 — Implementation Decisions (2026-03-05)

### [2026-03-05] Monetary storage: BIGINT cents, not DECIMAL or FLOAT
**Decision:** All monetary values are stored in the database as BIGINT representing integer cents
(e.g., $1,234.56 → 123456). Conversion uses Python's `decimal` module with `ROUND_HALF_UP`.
**Reason:** Avoids floating-point rounding errors in storage and retrieval. Integer arithmetic
is exact. Frontend formats cents to dollars via `/ 100` for display only.

### [2026-03-05] Parser abstraction: pure function, no DB or FastAPI dependency
**Decision:** `qb_parser.py` is a pure function: `parse_file(bytes, filename) → dict`. It has
no imports from the app layer (no SQLAlchemy, no FastAPI). All DB writes happen in the router.
**Reason:** When Phase 3 switches from file upload to QuickBooks API, only the router changes.
The parser is unchanged. This is the "contained change" required by CLAUDE.md.

### [2026-03-05] QB export format: "Distribution account" row is the canonical header
**Decision:** The parser identifies column headers by finding the row containing the literal text
"Distribution account" in column A. This row contains the period labels (e.g., "January 2026").
**Reason:** All observed QB .xlsx exports use this structure. It is more reliable than row index.

### [2026-03-05] Multi-month imports: all detected months imported in a single operation
**Decision:** When a QB export contains multiple month columns (e.g., Jan–Dec as the year builds),
all months are imported together in one upload operation. The user reviews mappings once and
confirms all periods in a single confirm call.
**Reason:** The user's workflow builds a YTD export that grows from 1 to 12 columns over the year.
Re-importing all months on each upload is correct behavior. Existing periods are upserted
(UNIQUE constraint on client_id + fiscal_year + month ensures no duplicates).

### [2026-03-05] Account mapping key: (client_id, report_type, qb_account_name)
**Decision:** The `account_mappings` unique key is the triple `(client_id, report_type, qb_account_name)`.
`report_type` is either `"profit_and_loss"` or `"balance_sheet"`.
**Reason:** The same account name can appear in both reports with different meanings. In the
Vetter Plumbing reference case, "2020 Toyota Tundra" appears in P&L (Vehicle Expenses →
overhead_expenses) AND Balance Sheet (Fixed Assets → total_fixed_assets). A (client_id, name)
key would create a DB conflict and produce wrong mappings.

### [2026-03-05] sign convention for other_income_expense
**Decision:** `other_income_expense` is stored as a NET value (income minus expenses). QB reports
"Other Expenses" as positive numbers, but they reduce net profit. The aggregation in
`MappingReview.jsx::computeTotals()` applies `sign = -1` when a row belongs to the
`other_expenses` QB section and maps to `other_income_expense`. All other P&L categories
are stored as positive values and subtracted in UI calculations (e.g., cost_of_sales
reduces gross profit by the stored amount).
**Reason:** Matches user's mental model of "Other Income / (Expense)" as a net line item.
Simplifies the ActualsDetail display formula: `netProfit = netOperatingProfit + other_income_expense`.

### [2026-03-05] Stateless confirm: frontend aggregates and sends pre-computed totals
**Decision:** The `/actuals/confirm` endpoint receives pre-computed `categories` totals per period
(already aggregated cents, keyed by ordobook_category). The frontend performs the aggregation.
The full `raw_rows` are also sent and stored in `monthly_actuals.raw_data` (JSONB) for audit trail.
**Reason:** Keeps the backend simple and the audit trail complete. The backend trusts the
frontend's math (it already validated the source data during upload). The JSONB raw_rows
allow future reprocessing without re-uploading files.

### [2026-03-05] auto_mapper confidence: "saved" > keyword match > section context
**Decision:** The auto_mapper applies three levels of priority:
1. **saved** — a previous confirmed mapping for this client+report_type+account exists → use it, confidence = "saved", needs_review = false
2. **keyword override** — account name matches a known pattern (e.g., "payroll service" → payroll_expenses, "depreciation" → depreciation_amortization) → confidence = "high", needs_review = false
3. **section context** — falls through to the section/subsection default → confidence depends on section clarity
**Reason:** Saved mappings are gold — the advisor already decided. Keywords cover predictable
non-standard names. Section context handles everything else.

### [2026-03-05] MappingReview route: state-based, not server-stored
**Decision:** The parsed preview data is passed from UploadPage to MappingReview via React Router
`navigate(..., { state: { preview, sourceFiles } })`. It is not stored server-side between
upload and confirm.
**Reason:** Keeps the backend stateless. The user reviews and confirms in one session.
If they navigate away, they re-upload — acceptable workflow for an internal tool.

### [2026-03-05] ClientWorkspace as landing hub (formerly direct to profile)
**Decision:** `/clients/:id` now routes to `ClientWorkspace` — a hub showing imported periods
and status, with CTAs to Import Data or view a period. Client Profile moved to `/clients/:id/profile`.
**Reason:** As the app gains more modules, the workspace hub is the right landing page.
Profile is an administrative screen, not the daily starting point.

### [2026-03-05] File parsing: openpyxl only (pandas not used in parser)
**Decision:** `qb_parser.py` uses `openpyxl` directly, not `pandas`. `pandas` remains in
`requirements.txt` for potential future analytical engine use.
**Reason:** The QB export format is well-understood and the parser needs fine-grained row-by-row
control over cell types and merged headers. `openpyxl` is sufficient and avoids DataFrame overhead.

---

## 📦 Phase 3a — Analytical Engine Scaffold (2026-03-09)

### [2026-03-09] Revenue model: 3-tier job mix
**Decision:** Revenue is modeled as three job tiers — Small, Medium, Large — each with
a per-month job count (JSONB dict) and a single annual average job value (cents).
Revenue = sum of (count × avg_value) across all three tiers per month.
**Reason:** Matches the Vetter Plumbing reference workbook's structure exactly.

### [2026-03-09] Cost of Sales: per-month percentage of revenue
**Decision:** COS is entered as a percentage (e.g., 35.5%) per month, not as a dollar amount.
The engine computes COS = revenue × (pct / 100) using Python Decimal arithmetic.
For actuals months, the effective COS% is derived from confirmed actuals and shown as read-only.
**Reason:** More intuitive than entering a dollar figure, and naturally scales with revenue.
A plumbing business thinks "materials are about 35% of each job," not a fixed dollar amount.

### [2026-03-09] Payroll model: cost-per-pay-run × runs + one-off
**Decision:** Payroll = (cost_per_pay_run × pay_runs_this_month) + one_off_amount.
`cost_per_pay_run` is a single annual figure. `pay_runs_per_month` and `payroll_one_off`
are per-month JSONB dicts. One-off handles irregular items like quarterly payroll tax.
**Reason:** Matches the reference workbook logic. Pay runs vary by month (some months have 3
bi-weekly pays). Irregular items like WA quarterly payroll tax are manual per-month entries.

### [2026-03-09] Other expense inputs: per-month manual entry
**Decision:** Marketing, depreciation, and other income/expense are all stored as per-month
JSONB dicts (cents). All are manually editable per month. `other_income_expense` can be
negative (expenses) or positive (income), consistent with the existing actuals sign convention.
**Reason:** These items don't follow a predictable formula; month-by-month manual entry with
actuals-derived auto-fill suggestions gives the most accurate forecasting flexibility.

### [2026-03-09] Auto-fill on config bootstrap
**Decision:** When creating a new forecast config for a year that already has some actuals,
the backend automatically computes averages from those actuals and pre-populates all 12 months
as starting suggestions. The user can override any forecast month. Actuals months are locked.
**Reason:** Reduces data entry. A plumbing business's cost structure doesn't change dramatically
month to month — last year's average is a reasonable starting estimate.

### [2026-03-09] Engine architecture: pure functions + orchestrator
**Decision:** Each engine module (revenue, payroll, owner_draws, overhead, forecast orchestrator)
is a pure Python function — no DB imports, no FastAPI imports. All inputs are Decimal; all
outputs are (Decimal result, trace_dict). The orchestrator blends actuals + projections.
**Reason:** Testable in isolation. No test database required to unit-test financial logic.
The router handles DB reads/writes; the engine just does math.

### [2026-03-09] calc_trace stored on every forecast_period row
**Decision:** Every `forecast_periods` row stores a `calc_trace` JSONB column containing
the full intermediate calculation breakdown for every financial line item in that month.
Actuals months store a minimal trace noting the source. Forecast months store component-level
breakdowns (e.g., "Small (5 × $800) = $4,000").
**Reason:** This is the foundation for the three-level audit trail (Level 1–3 / God Mode)
decided on 2026-02-24. The data must be stored now; the UI layers are built in Phase 3b.

### [2026-03-09] Forecast Drivers page layout: single page, 7 sections, 13 columns
**Decision:** All forecast inputs live on one page: Revenue Model, Cost of Sales, Payroll,
Other Expenses, Other Income/Expense, Owner Draws, P&L Summary. 13-column grid (label + 12 months + YTD). Actuals months are locked (gray, read-only). Forecast months are editable inputs.
The P&L summary section at the bottom shows Gross Profit, Net Operating Profit, Net Profit
as always-calculated rows. A "Recalculate" button saves and reruns the engine.
**Reason:** User requested single-screen layout. The P&L summary makes the forecast immediately
actionable — you can see the full bottom line while editing any driver.

### [2026-03-09] Known gaps deferred to Phase 3b
- Overhead line items UI (data model + engine support exists; no UI to add/edit named line items yet)
- 12-month output view (read-only blended P&L report across all 12 months as a deliverable)
- God Mode / Level 1-2-3 audit trail UI (calc_trace data exists; hover/click UI not yet built)

---

## 📦 Phase 2 Parser Hardening (2026-03-24)

### [2026-03-24] QB ghost column: filter non-"Month YYYY" periods in ingestion router
**Decision:** The ingestion router's `sorted_periods` now filters out any period label that
doesn't parse as "Month YYYY" before returning to the frontend.
**Reason:** QB P&L/BS exports sometimes include a single-day column like "Dec 31 – Dec 31 2024"
when the export date range starts at a month boundary. This column has no meaningful data and
would cause a 422 error in the confirm endpoint. Silently dropping it is correct behavior.
**Implementation:** `period_sort_key` returns 0 for unparseable labels; `sorted_periods` filters
`[p for p in all_periods if period_sort_key(p) > 0]`.

### [2026-03-24] QB invoice report: dates are "MM/DD/YYYY" strings, not datetime objects
**Decision:** The `parse_invoice_report` function now handles three formats for invoice detail rows:
- Format A: col_a is a datetime object (openpyxl parsed the date natively)
- Format B: col_a is a customer/invoice string, col_b is a datetime object
- Format C: col_a is None, col_b is a "MM/DD/YYYY" string (confirmed Vetter Plumbing format)
**Reason:** openpyxl reads QB invoice export dates as plain strings ("12/02/2024"), not datetime
objects. The original isinstance(col_b, datetime) check always returned False, giving a count of 0
for every month. The fix: also accept col_b strings containing "/" as valid invoice date rows.
**Verification:** December 2024 = 29 invoices confirmed against known count.

### [2026-03-24] MappingReview: `new` badge for all unsaved accounts
**Decision:** Any account without `confidence === 'saved'` gets a green `new` badge and green
left border on its row. Previously only `needs_review` accounts (low confidence) were flagged.
**Reason:** High-confidence auto-mapped accounts (e.g., "Sales" → Revenue by section context)
also need a glance on first import — they're new to the client's mapping database even if the
rule is obvious. The `saved` / `new` visual split makes reviewing a 30-account list instant.

### [2026-03-24] MappingReview: hooks must be ordered before early return
**Decision:** `useMemo` (and any hook) in MappingReview.jsx must be called before the
`if (!preview) { return ... }` early return guard.
**Reason:** React's rules of hooks prohibit calling hooks conditionally. Calling `useMemo`
after an early return changes the hook count between renders (when preview is null vs. not),
which causes React to silently crash and render a blank white screen with no error message.
**Fix:** `rows`, `periods`, and `totals` are now computed with safe defaults before the guard.

---

## 📦 Phase 3d — Projected Balance Sheet (2026-03-27)

### [2026-03-27] Migration 018: 8 new forecast_periods columns
**Decision:** Added `projected_cash`, `projected_fixed_assets`, `projected_other_lt_assets`,
`projected_total_current_assets`, `projected_total_assets`, `projected_total_current_liabilities`,
`projected_total_liabilities`, `projected_equity` to `forecast_periods`.
**Reason:** Completes the projected balance sheet — ForecastReport now shows a full Balance Sheet
with totals and equity, not just individual working capital line items.

### [2026-03-27] Opening balance seeded from prior fiscal year December actuals
**Decision:** `_run_calculation()` in the forecast router queries `monthly_actuals` for `fiscal_year-1, month=12`
before the month 1-12 loop and uses those values as the initial `prior_projected` seed.
For actuals months: balance sheet values read directly from `monthly_actuals`. For forecast months:
rolled forward (cash += net_cash_flow, fixed assets += capex − depreciation, other LT flat).
**Reason:** The projected balance sheet must be anchored to a real opening balance. Dec 2024 actuals
serve as the anchor for the 2025 forecast. Without seeding, all projected values start from zero.

### [2026-03-27] Equity = Total Assets − Total Liabilities
**Decision:** `projected_equity` is computed as `projected_total_assets − projected_total_liabilities`.
Not sourced from `equity_before_net_profit + net_profit_for_year` on the actuals record.
**Reason:** Consistent formula across both actuals and forecast months. Avoids double-counting
equity components. Total Assets − Total Liabilities is the fundamental accounting identity.

### [2026-03-27] QB Balance Sheet parser: flexible header row detection + period label normalization
**Decision:** Two parser improvements added together:
1. `_find_header_row()` now falls back to detecting the header row by finding the first row whose
   non-first cells contain month-name period labels — handles QB Balance Sheet exports that don't
   use "Distribution account" as the first column header.
2. `_normalize_period_label()` converts `"Dec 31, 2024"`, `"December 31, 2024"`, and
   `"As of Dec 31, 2024"` → `"December 2024"` — handles single-date Balance Sheet exports.
**Reason:** QB Balance Sheet "by Month" exports use a different header format than P&L exports.
QB single-date Balance Sheet exports use date-format column headers that were being dropped by
the ghost-column filter, resulting in all-zero balance sheet data for those periods.

### [2026-03-27] Workspace: "Actuals History" + "Review Mapping" buttons added
**Decision:** When actuals exist for a client, two secondary action buttons appear in the
ClientWorkspace header alongside "Import Data":
- **Actuals History** — navigates to `/actuals/history` (the full cross-month table)
- **Review Mapping** — fetches stored raw_data + current mappings from new endpoint
  `GET /actuals/mapping-review-data` and opens MappingReview pre-populated.
**Reason:** Advisor needs to re-access mapping and history without re-uploading files.
The "Review Mapping" flow reconstructs the preview from raw_data stored at import time —
the original parsed rows are preserved in `monthly_actuals.raw_data` JSONB for exactly this purpose.

---

## 📦 Phase 4 — Scoring, Targets & Navigation Architecture (2026-03-31 / 2026-04-05)

### [2026-03-31] Phase 4 complete: Targets v2 + Scoreboard (migration 019)
**Decision:** Targets page uses driver-computed fields (Jobs × Avg = Revenue, COS toggle, projected BS).
Scoreboard shows YTD/forecast/target/prior year with grade pills, summary banner, max-3-red advisory philosophy.
See MEMORY.md Targets Page Architecture and Phase 4 Scoreboard Architecture sections for full detail.

### [2026-04-05] Application Navigation: Two-space model (Workspace + Reports)
**Decision:** ORDOBOOK's primary navigation is organized into two spaces:

**Workspace** — where the advisor does analytical work:
- **Actuals tab** — working view of actuals with cash flow and profit driver results displayed
  (similar in density to the Forecast Drivers page). Import button lives here as a contextual
  action. Sidebar also has a persistent Import shortcut.
- **Forecast Drivers tab** — the 13-column forecast model, editable drivers
- **Targets tab** — annual targets with driver-computed fields, COS toggle, projected BS

**Reports** — what gets produced and shared with clients (4 tabs, all in one tabbed view):
1. **Actuals** — clean Balance Sheet + P&L (rebranded QB output, simpler than workspace view)
2. **Forecast** — 12-month combined actuals + forecast report
3. **Scoreboard** — 1-page dashboard with red/yellow/green grades
4. **Action Plan** — editable-in-place structured text report (assignee + due date per item)

**Reason:**
- Workspace = input/analysis tools. Reports = deliverable outputs. Clean mental model.
- Advisor and client look at different views of the same data — workspace has more analytical
  density, reports are client-presentation clean.
- Tabbed Reports view enables flipping between Scoreboard → Forecast → Action Plan during a meeting.
- Import lives contextually inside Workspace > Actuals tab (natural workflow: import → see actuals
  → move to forecast), plus a sidebar shortcut for direct access.
- Action Plan is both a working document and a deliverable — treating it as an editable Report tab
  keeps it in the deliverables space without requiring a separate edit mode.
- Scoreboard moves OUT of workspace cards → INTO Reports tabs. It's an output, not a working tool.

**Routes implied (pending implementation):**
```
/clients/:id/workspace/actuals     — working actuals view + import button
/clients/:id/workspace/forecast    — forecast drivers
/clients/:id/workspace/targets     — targets

/clients/:id/reports/actuals       — clean BS + P&L
/clients/:id/reports/forecast      — 12-month forecast report
/clients/:id/reports/scoreboard    — scoreboard
/clients/:id/reports/action-plan   — action plan editor
```

---

## 📦 Parser Hardening — 2026 Format Support (2026-04-09)

### [2026-04-09] QB 2026 Balance Sheet: abbreviated month headers + two-stage parser fix
**Problem:** QB Balance Sheet multi-month exports for 2026 use abbreviated column headers
("Jan 2026", "Feb 2026", "Mar 2026") instead of full names or date-format labels.
This caused two sequential failures:
1. `_row_has_period_columns` only matched full month names → couldn't find the header row at all → "Could not find column header row" error
2. After fixing detection, `_normalize_period_label` had no case for "Mon YYYY" (abbreviated + year, no day) → labels passed through unchanged → `period_sort_key` in the ingestion router rejected them → "0 periods detected"

**Fix:**
1. `_row_has_period_columns` regex now includes 3-letter abbreviations (Jan, Feb, Mar, Apr, Jun, Jul, Aug, Sep, Oct, Nov, Dec) alongside full month names
2. `_normalize_period_label` now handles "Mon YYYY" format as first match case (before "Mon DD, YYYY"), converting "Jan 2026" → "January 2026"
3. `parse_invoice_report` month header detection now routes through `_normalize_period_label` so abbreviated headers ("Jan 2026") are recognized the same as full names

**Confirmed format (Vetter Plumbing, April 2026 import):** "Jan 2026", "Feb 2026", "Mar 2026"

---

## 💡 Parking Lot (Acknowledged Future Ideas)

These are real ideas that belong in a future version or a separate project.
They are documented here so they don't get lost.

- **QuickBooks Online API integration** — direct OAuth connection, no file upload required (Phase 3)
- **Client-facing portal** — shareable link to latest Scoreboard, Forecast, Action Plan (Phase 2 product)
- **Virtual CFO chatbot** — AI assistant trained on client data to answer advisory questions (Phase 2 product)
- **Action Plan completion tracking with positive reinforcement** — checkmarks, streaks, end-of-month
  highlight reel celebrating progress regardless of Scoreboard color; frequent low-stakes positive
  interactions that make clients *want* to open the app (Phase 2 product, core design principle)
- **Tax Projection module** — internal working tool, separate project
- **Retention Rate & Conversion Rate modules** — if clients adopt recurring service models
- **Multi-user access** — staff or contractor accounts with role-based permissions
- **Blockchain / audit trail** — immutable financial record keeping (very long-term)
- **5-Year Plan module** — absorbed into Scenario Sandbox; precision multi-year forecasting deprioritized
