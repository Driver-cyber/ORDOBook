# NEXT SESSION — Boot Checklist
> Last updated: 2026-03-13 | 12-month report view complete

---

## Where We Are

- Phase 3a engine: ✅ built
- Phase 3b UX + light theme: ✅ done
- 12-month report view: ✅ built (2026-03-13) — "View Report →" on Forecast Drivers page
- **Vetter Plumbing verification: still pending** — use the report view to compare against Excel

**Phase 3b is complete once verification passes. Then:**
1. Audit trail Level 1 (hover tooltip on calculated values)
2. Phase 3c — Balance Sheet / Cash Flow section

---

## Step 1 — Start PostgreSQL

Data directory is owned by `cstewch`. Run this first every session:

```bash
sudo -u cstewch /opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 start
```

**One-time permanent fix** (run once to avoid this forever):
```bash
sudo chown -R ordocfo /opt/homebrew/var/postgresql@17
```
After that, `brew services start postgresql@17` works normally.

---

## Step 2 — Boot the app

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

## Step 3 — Vetter Plumbing verification

Open Vetter Plumbing → Forecast → enter driver values from the Jan 2026 Excel workbook
→ Recalculate → View Report → compare to Excel.

If numbers don't match, debug via:
- `backend/app/engine/forecast.py` → `_period_from_drivers()`
- `backend/app/engine/revenue.py` → job count × avg value
- `backend/app/engine/payroll.py` → runs × cost_per_run
- `GET http://127.0.0.1:8000/api/clients/{id}/forecast/2026/1/trace`

---

## Up Next (after verification)

1. **Audit trail Level 1** — hover tooltip on any calculated value showing its formula from `calc_trace`
2. **Phase 3c — Balance Sheet / Cash Flow** — Owner Distributions, Tax Savings Reserve, DSO → AR balance, Net Cash Impact

---

## Key Notes

- Light theme: DO NOT reintroduce dark hex values (`#1a1d22`, `#0e0f11`, etc.) in any new component
- Owner draws / tax savings are balance sheet items — they do NOT reduce Net Income
- `overhead_schedule` DB column exists but is unused; `other_overhead_monthly` replaced it
- Legacy scalar `small/medium/large_job_avg_value` fields still exist as fallback
- DB is PostgreSQL in dev; migrates to SQLite when Electron packaging begins
