# CLAUDE.md — ORDOBOOK Project Constitution
> **This file is the governing document for all AI-assisted development on ORDOBOOK.**
> Read this before touching any code. It supersedes convenience.

---

## 🧭 Purpose & North Star

ORDOBOOK is a **financial advisory workflow application** built for a solo consulting practice.
Its purpose: take raw bookkeeping data after a monthly close, automate the analytical work
currently done in Excel, and produce a standardized set of client deliverables — the Scoreboard,
12-Month Forecast, and Action Plan.

The deeper mission: **identify the key business drivers for each client, focus energy on what
moves the needle, and measure incremental progress toward their goals.** Every feature decision
should serve this mission.

The guiding philosophy is *Ordo ab Chao* — order from chaos. We take disparate financial data,
messy exports, and client-specific variation, and we produce something clear, useful, and
trustworthy. We do not let perfect be the enemy of good.

**The deeper truth about what this product is:** ORDOBOOK is not a financial reporting tool.
It is a **human progress tool that uses financial data as its primary signal.** A green
Scoreboard is not the definition of success — a client who is exhausted and miserable with
green metrics needs a different conversation than the dashboard suggests. The data is the
launching point for a human conversation, not the destination. Every design decision should
serve the advisor's ability to have that conversation well.

---

## 🗺 The Two-Product Roadmap

ORDOBOOK is **Product 1** in a two-product ecosystem:

**ORDOBOOK (this project):** Local-first desktop application for financial advisors.
The analytical engine. Ingests bookkeeping data, runs models, produces deliverables.
Client data never leaves the advisor's machine unless explicitly exported.

**[Cloud Platform — Product 2]:** Separate SaaS product (future). Ingests ORDOBOOK's
standardized JSON exports to create live client dashboards, AI-powered advisory
chatbot, and client-facing 24/7 engagement tools. Build this *after* ORDOBOOK v1 ships.

**Critical principle:** ORDOBOOK is designed to work *forever* without the cloud product.
The JSON export format is the handoff layer. Keep the products architecturally separate.

---

## 🏗 Architecture Overview

**Type:** Local-first desktop application
**Platform:** Electron (wraps React frontend + embedded FastAPI backend)
**Access:** Native app on macOS/Windows (future: Linux)
**Users:** Single primary user (solo consultant), architecture supports future staff access
**Philosophy:** Client financial data never leaves the advisor's machine. Privacy and security through architecture, not promises.

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Desktop Framework | Electron + electron-builder | Industry standard for web→desktop, code signing, auto-updates |
| Frontend | React (Vite) | Industry standard, supports future client dashboard (Product 2) |
| Backend | Python (FastAPI) embedded | Runs locally, starts with app, no network required |
| Database | SQLite | Single-file, local, perfect for single-user, SQL is SQL |
| File Parsing | pandas + openpyxl | QuickBooks .xlsx export parsing |
| PDF Generation | WeasyPrint | HTML/CSS templates rendered to PDF locally |
| Styling | Tailwind CSS | Utility-first, consistent with design language |

### Data Storage Locations

| Data Type | Location |
|-----------|----------|
| SQLite Database | `~/Library/Application Support/ORDOBOOK/ordobook.db` (macOS) / `%APPDATA%/ORDOBOOK/ordobook.db` (Windows) |
| Uploaded QB Files | `~/Library/Application Support/ORDOBOOK/imports/` |
| Generated PDFs | `~/Library/Application Support/ORDOBOOK/exports/` |

### Data Source
- **Primary:** QuickBooks Online Excel (.xlsx) exports uploaded via drag-drop
- **Future (Phase 3+):** QuickBooks Online API (OAuth 2.0 direct integration)
- The ingestion layer MUST be designed so that swapping from file upload to API pull
  is a contained change, not a rebuild. Abstract the data source behind a clean interface.

> **Dev note:** Current development setup uses PostgreSQL for convenience. Migration to SQLite happens when Electron packaging begins. The ORM layer (SQLAlchemy) makes this a contained change.

---

## 🗂 Application Structure

ORDOBOOK is organized **client-first, then chronologically.** This is not negotiable.

```
ORDOBOOK
└── Client Roster (home screen)
    └── [Client Name]
        ├── Client Profile & Settings
        │   ├── Business info & terminology
        │   ├── Account mapping (QuickBooks → ORDOBOOK)
        │   └── Annual targets
        └── [Year]
            └── [Month]
                ├── Status: Imported → Mapped → Reviewed → Scored → Exported
                ├── Actuals (parsed from QB export)
                ├── Forecast (actuals + forward model)
                ├── Targets & Scoring
                ├── Scoreboard
                └── Action Plan
```

The UX mental model is **"Projects" UI** — like a file manager where each client is a project
folder. You open a client, you're in their world. You should never feel lost about where you are.

---

## 🎨 Design Language

ORDOBOOK's visual identity is **focused elegance** — dark, clean, minimal, purposeful.

- **Color palette:** Dark neutral backgrounds, high-contrast text, restrained accent colors
- **Color as signal:** Green/Yellow/Red is reserved exclusively for performance grades.
  It is never used decoratively.
- **Navigation:** Persistent left sidebar. Client context always visible.
- **Whitespace:** Generous. Never cram. Each screen has one primary job.
- **Progressive disclosure:** Summary first, detail on demand. Raw data (account mappings,
  formula drivers) lives one level deeper than daily workflow surfaces.
- **Typography:** Clean sans-serif. Numerical data gets monospace treatment.
- **Reference aesthetic:** Claude desktop application — the sidebar + workspace layout,
  the calm dark theme, the clarity of purpose.

If a design decision would make the app feel like generic enterprise software or a cluttered
Excel replacement, reject it. We are building something better.

---

## 📦 Module Definitions

### Module 1 — Client Foundation
- Client profile (name, fiscal year, terminology config) stored in SQLite
- Account mapping interface: upload QB Balance Sheet/P&L → review auto-mapped accounts
  → confirm/override → save mapping to client profile in SQLite
- Account mapping persists in database and is applied automatically to future uploads for that client
- Annual targets (set per metric, per fiscal year) stored in SQLite
- All data stored locally in `~/Library/Application Support/ORDOBOOK/ordobook.db`

### Module 2 — Data Ingestion
- Upload interface: Balance Sheet (.xlsx), P&L (.xlsx), Transaction count report (.xlsx)
- Parser applies client's saved account mapping
- Review/edit screen before committing data — user must confirm parsed data
- Stores structured Actuals record tagged with client_id, fiscal_year, month
- Error handling: flag unmapped accounts, prompt for resolution before proceeding

### Module 3 — Analytical Engine
- Replicates workbook formula logic in Python: Revenue modeling, Overhead scheduling,
  Payroll modeling, flowing into the 12-Month Forecast
- Manual override interface: adjust forecast drivers (job counts, average job value,
  overhead line items, payroll) and see model update in real time
- Client-specific configuration: each client's model is parameterized, not hardcoded.
  One engine, client-specific drivers.
- Verify outputs against known Excel results during development (use the Vetter Plumbing
  workbook as the reference test case)
- **CRITICAL — Intermediate Storage:** The engine must store ALL intermediate calculation
  steps, not just final outputs. Every displayed number must be traceable to its source inputs.
  This is a hard architectural requirement, not a nice-to-have.

### Module 3a — Audit Trail & God Mode (built alongside Module 3, not after)
- **Level 1 (Hover):** Popover showing top-level formula for any calculated value
- **Level 2 (Expanded):** Click-through panel showing full component breakdown with
  source tags (Actual / Forecast Driver / Manual Override) for every line item
- **Level 3 (God Mode):** Full-screen toggle revealing all drivers and intermediate
  calculations in an editable structured view. Color-coded by source type. Real-time
  downstream recalculation on any driver change. Toggle off returns to clean view.
- God Mode is the "spreadsheet view" — designed for the auditor brain, not the client brain.

### Module 4 — Scoring & Targets
- Targets interface: set annual targets per KPI per client
- Grade assignment UI: select Green / Yellow / Red per metric
- Scoreboard view: visual summary of grades with YTD actuals and forecast

### Module 4b — Scenario Sandbox
- Replaces and combines the What If column and 5-Year Plan tab into one tool
- Purpose: connect a number on a report to a real-world decision or trade-off
- Supports current-year and 2-3 year forward scenario modeling
- Scenarios are clearly isolated from the working forecast — no scenario change
  ever overwrites actuals or the committed forecast
- Designed as a live conversation tool for advisory meetings, not a precision engine
- Frame: "What happens if we hire in April?" not "predict 2029 revenue exactly"

### Module 4c — Advisor Context Layer (private, never exported)
- Each client profile has a private notes field visible only to the advisor
- Soft context that travels with the client: energy level, personal pressures,
  goals beyond the numbers, things to revisit next meeting
- Never appears in any client-facing export or PDF
- Purpose: ensure the advisor never walks into a meeting cold, even after months away

### Mode Toggles (accessible via application menu, not prominent UI)
Both modes are powerful tools used infrequently. They should be easy to find and
impossible to trigger accidentally. They live in the app menu / settings area, not
on the main workspace surface.

**God Mode** — transforms the workspace into a full structured editable view of all
drivers and intermediate calculations. For the auditor brain. Every number traceable.

**Meeting Mode** — distraction-free view designed for the one hour per month when
the advisor is face-to-face with a client. Left panel: previous month's Action Plan
with checkboxes to tick off together. Right panel: live editor for the new Action Plan.
Hit "End Meeting" to save the draft. Nothing else visible. No editing of forecasts,
no accidentally triggering other functions. Calm and focused.

> **Clarification:** Meeting Mode is a screen-share friendly UI. The advisor opens it
> and shares their screen during Zoom/Teams calls. Clients see through the advisor's
> screen — they do not have their own ORDOBOOK account. ORDOBOOK is advisor-only software.

### Module 5 — Deliverable Generation
- Scoreboard PDF export
- 12-Month Forecast PDF export
- Action Plan: structured editor with fields (Objective, Current Results, Next Steps,
  Owner, Due Date, Notes) — matches current Excel layout. Simple, no over-engineering.
- Action Plan PDF export
- All data output MUST also be available as structured JSON — this is the handoff
  interface for the future cloud dashboard / Virtual CFO product

---

## 🚫 Explicit Out of Scope (ORDOBOOK v1)

Do not build, do not stub, do not reference in code:

| Feature | Decision Date | Reason |
|---|---|---|
| Tax Projection module | 2026-02-24 | Too non-standard, too much logic lives in consultant's head; separate project |
| Conversion Rate tracking | 2026-02-24 | Unused in current workflow, deprioritized |
| Retention Rate tracking | 2026-02-24 | Unused in current workflow, deprioritized |
| Blockchain / distributed ledger | 2026-02-24 | Version 3-5 concept, no current practical path |
| Multi-user admin UI | 2026-02-24 | Solo user for now; data model supports it, UI deferred |
| QuickBooks API integration | 2026-02-24 | Phase 3 enhancement; ingestion layer designed to support it without rebuild |

**Product 2 Features (acknowledged, separate project, build after ORDOBOOK v1 ships):**
- Client-facing portal / dashboard with shareable links
- Live, always-current client dashboards
- AI chatbot (advisor-facing prep tool + client-facing 24/7 Q&A)
- Virtual CFO positioning
- Action Plan completion tracking with positive reinforcement
- Client engagement analytics
- Conversation monitoring (AI surfaces interesting questions for advisor review)
- Multi-client portfolio views

---

## 🧠 Development Philosophy

### Measure Twice, Cut Once
Before any multi-file edit or new module, Claude must:
1. Propose a written implementation plan
2. Wait for explicit approval ("go" / "y" / "looks good") before writing code
3. If a request seems to contradict existing architecture, ask: "Are we pivoting?" before refactoring

### Token Consciousness
- Do not read entire directories recursively unless necessary
- Ask for specific file paths rather than exploring blindly
- Do not re-read files already in context
- Prefer targeted edits over full file rewrites

### Iterative by Default
- Build one module to working state before starting the next
- Each module should be demonstrably useful before the next begins
- Prefer simple and working over complex and theoretically better

### Guided Setup Always
- This project's primary user has moderate terminal comfort
- Any deployment, environment setup, or configuration steps must be accompanied by
  clear, numbered, step-by-step instructions
- Never assume familiarity with CLI tools, environment variables, or cloud dashboards
- When something could go wrong, say so and explain how to recover

### Financial Accuracy is Non-Negotiable
- The analytical engine must be verified against the reference workbook (Vetter Plumbing,
  January 2026) before any module is considered complete
- Rounding and currency handling: always use Python's `decimal` module for financial math,
  never floating point
- Formula changes require explicit documentation of what changed and why
- **Every displayed calculated value must have a stored source chain.** A number that
  cannot be traced back to its inputs will not be displayed. No exceptions.

### Branding
- The primary user has brand assets (logo, color palette, typography) that will be
  provided and placed in the project folder. Claude Code must check for a `/branding`
  or similar directory and apply those assets to all UI work before finalizing any
  visual component. Do not finalize color or logo decisions without checking for these files.

---

## 📤 JSON Export Format (Product 2 Handoff Layer)

All ORDOBOOK deliverables must be exportable as structured JSON in addition to PDF.
This JSON format is the bridge to Product 2 (cloud platform).

### Export Structure (per client, per period)

```json
{
  "ordobook_version": "1.0.0",
  "export_timestamp": "2026-01-31T10:30:00Z",
  "client": {
    "id": "vetter-plumbing",
    "name": "Vetter Plumbing Svc. LLC",
    "fiscal_year_start": "january",
    "industry": "plumbing_services"
  },
  "period": { "year": 2026, "month": 1, "label": "January 2026" },
  "scoreboard": {
    "metrics": [
      { "name": "Total Jobs", "value": 27, "target": 25, "grade": "green", "variance_pct": 8.0 }
    ],
    "overall_grade": "green"
  },
  "forecast_12mo": {
    "months": [
      { "period": "2026-01", "revenue": 5917838, "gross_profit": 3868300, "actuals": true }
    ]
  },
  "action_plan": {
    "items": [
      {
        "id": "ap-001",
        "objective": "Prepare for hiring an employee",
        "next_steps": "Create job description and compensation plan",
        "owner": "Doug",
        "due_date": "2026-02-28"
      }
    ]
  },
  "actuals": {},
  "targets": {},
  "metadata": {
    "generated_by": "ORDOBOOK Desktop v1.0.0",
    "advisor_notes": null
  }
}
```

### Version Control
- Breaking changes increment major version (1.x → 2.x); additive changes increment minor (1.0 → 1.1)
- File naming: `{client-id}_{year}_{month}_export.json` (e.g. `vetter-plumbing_2026_01_export.json`)

---

## 📝 Maintenance Protocol

After completing each module or significant pivot:
1. Prompt the user: "Should I update DECISIONS.md with what we decided?"
2. Log the decision with date, what was decided, and why
3. If the conversation exceeds ~20 messages without a clear stopping point,
   suggest: "We should probably summarize where we are and start a fresh context."

---

## 🔗 Product 2 Context (Separate Project, Post-v1)

**Product 2 (future, separate SaaS):** A cloud platform that ingests ORDOBOOK's
structured JSON exports to provide:
- Live client dashboards (shareable links, always up-to-date)
- AI chatbot trained on client's financial data
  - **Advisor-facing mode:** Prep tool, insight suggestions, question drafter
  - **Client-facing mode (optional):** 24/7 Q&A with advisor oversight
- Conversation monitoring: AI surfaces interesting client questions for advisor review
- "Virtual CFO" positioning: AI that knows your business, available anytime
- Multi-client portfolio analytics for the advisor

**Design decisions in ORDOBOOK that affect this handoff:**
- All deliverable data must be exportable as structured, versioned JSON
- Client and period identifiers must be consistent and stable (no opaque IDs)
- The account mapping system should produce output legible to an external system
- The Action Plan data structure should anticipate future completion-tracking fields

**Non-negotiable separation:**
- ORDOBOOK works 100% offline, forever
- Cloud product is opt-in, not required
- No ORDOBOOK feature should assume cloud product exists
- JSON export is the *only* connection point between products

Do not build Product 2 features in ORDOBOOK. Do design ORDOBOOK's outputs with Product 2 in mind.
