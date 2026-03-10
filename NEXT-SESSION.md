# NEXT SESSION — Boot Checklist
> Last updated: 2026-03-09 | Phase 3a scaffold complete

---

## Where We Are

Phase 3a is done. The analytical engine, database tables, API endpoints, and
Forecast Drivers page are all built. No numbers have been verified yet.

**The one thing blocking Phase 3b:** Run the test cycle below and confirm the
engine output matches the Vetter Plumbing January 2026 reference workbook.

---

## Step 1 — Boot the app

**Terminal window 1 — Backend:**
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
source venv/bin/activate
uvicorn app.main:app --reload
```
Expected: `Uvicorn running on http://127.0.0.1:8000`

**Terminal window 2 — Frontend:**
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/frontend"
npm run dev
```
Expected: `Local: http://localhost:5173`

---

## Step 2 — Smoke test the Forecast page

1. Open http://localhost:5173
2. Open (or create) Vetter Plumbing as a client
3. Click **Forecast** in the left sidebar → should load the Forecast Drivers page
4. Verify all 7 sections render: Revenue Model, Cost of Sales, Payroll,
   Other Expenses, Other Income/Expense, Owner Draws, P&L Summary
5. If actuals have been imported for any months, verify those month columns
   are gray/locked and non-editable

---

## Step 3 — Enter Vetter Plumbing January 2026 driver values

Open the Vetter Plumbing Excel workbook and enter the following into the
Forecast page for the **forecast months** (non-actuals months):

**Revenue Model:**
- Small job count, avg value
- Medium job count, avg value
- Large job count, avg value

**Cost of Sales:**
- COS % for January (compute from workbook: COS ÷ Revenue × 100)

**Payroll:**
- Cost per pay run
- Number of pay runs in January
- Any one-off payroll items

**Other Expenses:**
- Marketing / advertising amount
- Depreciation & amortization amount

**Other Income / Expense:**
- Any other income or expense (net, positive = income)

Hit **Recalculate**.

---

## Step 4 — Verify outputs against the reference workbook

Compare the Forecast page calculated rows to the Excel workbook for January 2026:

| Line Item | Excel Value | Forecast Page | Match? |
|---|---|---|---|
| Total Revenue | | | |
| Cost of Sales | | | |
| Gross Profit | | | |
| Total Payroll | | | |
| Net Operating Profit | | | |
| Net Profit | | | |

All values should match to the dollar (rounding within $1 is acceptable due to
integer cents storage).

---

## Step 5 — If numbers match → proceed to Phase 3b

Phase 3b work items (in priority order):

1. **Overhead line items UI** — the `overhead_schedule` JSONB field exists in the
   data model and engine, but the Forecast page has no UI to add/edit named line
   items. Build a section where the user can add rows (e.g., "Rent $2,500/mo") and
   edit per-month amounts. The "Total Other Expenses" CalcRow currently only reflects
   overhead, so this will make it accurate.

2. **12-month output view** — a read-only page showing the full blended P&L across
   all 12 months as a clean report (not editable inputs). Route: `/clients/:id/forecast/:year/report`
   This is the deliverable version of the Forecast Drivers page.

3. **Audit trail UI — Level 1 (hover)** — wire up the `calc_trace` data that's
   already stored in `forecast_periods`. Show a hover tooltip on any calculated value
   displaying the top-level formula (e.g., "5 small × $800 + 8 medium × $2,000 = $20,400").

---

## Step 6 — If numbers DON'T match → debug

Common places to look:
- `backend/app/engine/forecast.py` — `_period_from_drivers()` function
- `backend/app/engine/revenue.py` — job count × avg value math
- `backend/app/engine/payroll.py` — runs × cost_per_run
- Check the `calc_trace` for the month via:
  `GET /api/clients/{id}/forecast/2026/1/trace`
  This shows the full component breakdown — easy to spot where a number diverges.

---

## Known Gaps / Notes for Next Session

- **"Total Other Expenses" label** on the Forecast page only shows `overhead_expenses`
  (items from the overhead_schedule). Marketing and Depreciation have their own CalcRows
  above it. This is correct but the label could be clearer — consider renaming to
  "Overhead Items" in Phase 3b.

- **Overhead_schedule UI** is the biggest missing piece on the Forecast page. Until it's
  built, the overhead_expenses line will always show $0 in forecast months.

- **File permissions**: project files owned by `cstewch`. Claude Code runs as `ordocfo`.
  If write errors appear, run at session start:
  ```bash
  printf '#!/bin/bash\nchown -R ordocfo "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"\n' \
    > /tmp/fix_all.sh && chmod +x /tmp/fix_all.sh && \
    osascript -e 'do shell script "/tmp/fix_all.sh" with administrator privileges'
  ```

- **DB is still PostgreSQL** in dev. Migration to SQLite happens when Electron packaging starts.
  No action needed now.
