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

**Current Phase:** Phase 1 complete and verified running locally (2026-03-04). Ready for Phase 2.

**Current Vibe:** Deliberate. Plan before building. Verify before shipping. One module at a time.

---

## 🛠 Active Tech Stack

| Component | Decision | Status |
|---|---|---|
| Frontend | React (Vite) | ✅ Decided |
| Backend | Python (FastAPI) | ✅ Decided |
| Database | PostgreSQL | ✅ Decided |
| Hosting | Railway or Render | ✅ Decided (Railway preferred, Render as backup) |
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

### [2026-02-24] Application Type: Cloud-hosted web app
**Decision:** Build as a cloud-hosted web application, not a local/desktop app.
**Reason:** User works across multiple devices. Future Phase 2 product requires cloud
infrastructure anyway. No reason to pay the local app cost and then rebuild.

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
| 2 | Data Ingestion: QB export parsing, account mapping, Actuals | Weeks 5-10 | 🟡 Next up |
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
