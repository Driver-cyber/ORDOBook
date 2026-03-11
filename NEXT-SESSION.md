# NEXT SESSION — Boot Checklist
> Last updated: 2026-03-11 | Phase 3b UX batch complete

---

## Where We Are

Phase 3a engine is built. Phase 3b UX batch is done. The Forecast page has been
substantially rebuilt. Engine verification against Vetter Plumbing still pending
— the test run was started but data entry wasn't completed.

**The one thing still blocking full Phase 3b completion:** Finish the Vetter Plumbing
verification run (enter driver values, confirm outputs match Excel).

---

## Step 1 — Boot the app

**Terminal 1 — Backend:**
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
source venv/bin/activate
uvicorn app.main:app --reload
```

**Terminal 2 — Frontend:**
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/frontend"
npm run dev
```

---

## Step 2 — Complete the Vetter Plumbing test run

Resume from TEST-RUN-CHECKLIST.md (already partially filled in).
Sections 1–3 input fields were confirmed working. Still need:
- Enter all driver values from the Excel workbook
- Hit Recalculate
- Fill in the output verification table (Section 9)

---

## Step 3 — What changed in this session (2026-03-11)

### Forecast page UX improvements
- **Click to select all** — clicking any input auto-highlights content; just type to replace
- **Autofill `→` button** — left of every row; copies first forecast month across all 12 months
- **Per-month avg values** — job avg values are now independently editable per month (not a synced scalar)
- **Actuals months** — dimmed (✓) but editable; no hard lock
- **Other Overhead row** — new editable catch-all line (rent, utilities, etc.)
- **Total Other Expenses** — now correctly shows Marketing + Depreciation + Other Overhead
- **Owner Draws section removed** — these are balance sheet items, not P&L (see Phase 3c)

### New DB fields (migrations 009–011)
- `forecast_configs.other_overhead_monthly` (JSONB cents per month)
- `forecast_configs.small/medium/large_job_avg_value_monthly` (JSONB cents per month)
- `forecast_periods.total_other_expenses` (BigInt cents)

### Financial model clarification
Owner draws and tax savings are **balance sheet / cash flow items**, not P&L expenses.
They do NOT reduce Net Income. They will live in Phase 3c (Balance Sheet / Cash section).

---

## Step 4 — If Vetter Plumbing numbers verify → Phase 3b remaining items

1. **12-month report view** — read-only blended P&L across all 12 months
   Route: `/clients/:id/forecast/:year/report`
   This is the clean deliverable version (no input fields, just formatted output).

2. **Audit trail Level 1 (hover)** — hover tooltip on any CalcRow value showing
   the top-level formula from `calc_trace` (e.g. "5 × $800 + 8 × $2,000 = $20,400")

---

## Step 5 — Phase 3c (after 3b complete): Balance Sheet / Cash Flow Section

New page or section with:
- Owner Distributions (monthly cash out)
- Tax Savings Reserve (cash set aside)
- Days Sales Outstanding → projected AR balance
- Net Cash Impact per month
- Other working capital metrics

---

## Debugging reference

If numbers don't match Excel:
- `backend/app/engine/forecast.py` → `_period_from_drivers()`
- `backend/app/engine/revenue.py` → job count × avg value
- `backend/app/engine/payroll.py` → runs × cost_per_run
- Check calc_trace: `GET http://127.0.0.1:8000/api/clients/{id}/forecast/2026/1/trace`

---

## Known notes

- `overhead_schedule` column still exists in the DB (kept for safety / future use)
  but is no longer used by the engine. `other_overhead_monthly` replaces it.
- Legacy scalar `small/medium/large_job_avg_value` fields still exist; engine falls
  back to them if the monthly JSONB has no value for a month.
- DB is still PostgreSQL in dev. Migration to SQLite happens when Electron packaging starts.
