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

**Current Phase:** Phase 2 code complete (2026-03-05). Architecture pivot: local-first desktop app.

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
| 2 | Data Ingestion: QB export parsing, account mapping, Actuals | Weeks 5-10 | ✅ Code complete (2026-03-05) — needs end-to-end test |
| 3 | Analytical Engine: Revenue, Overhead, Payroll, Forecast + manual overrides | Weeks 11-20 | 🔜 Not started |
| 4 | Scoring & Targets: Targets UI, grading, Scoreboard, What If scenarios | Weeks 21-24 | 🔜 Not started |
| 5 | Deliverable Generation: PDF exports, Action Plan editor, JSON outputs | Weeks 25-30 | 🔜 Not started |

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
