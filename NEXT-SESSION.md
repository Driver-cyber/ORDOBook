# NEXT SESSION — Boot Checklist
> Last updated: 2026-03-14 | Phase 3c complete, migrations 013–016 applied

---

## Where We Are

- Audit Trail Level 1: ✅ hover tooltips on all CalcRow/DataRow values
- Phase 3c Cash Flow Drivers: ✅ complete
  - DSO/DIO/DPO driver inputs on Forecast page
  - Owner Distributions + Tax Savings Reserve back in UI
  - Projected AR/Inventory/AP CalcRows
  - Net Cash Flow CalcRow (Net Profit − Distributions − Tax Savings)
  - Cash Flow Indicators card on ActualsDetail
  - Cash Flow section on Report page
- Migrations 013–016 applied, DB at head

**Next up:**
1. Verify cash flow section works correctly in browser (enter drivers, recalculate, check numbers)
2. Phase 3d — Balance Sheet ending balances (12-month projected BS)
3. Phase 4 — Targets & Scoring / Scoreboard

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

## Key Notes

- Light theme: DO NOT reintroduce dark hex values (`#1a1d22`, `#0e0f11`, etc.)
- Owner draws / tax savings are balance sheet items — do NOT reduce Net Income
- Net Cash Flow = Net Profit − Owner Distributions − Tax Savings (not a P&L item)
- DSO/DIO/DPO stored as integer days; projected balance = revenue (or COS) × days / 30
- `overhead_schedule` DB column exists but unused; `other_overhead_monthly` replaced it
- Legacy scalar `cost_per_pay_run` kept as fallback; `cost_per_pay_run_monthly` is live
- DB is PostgreSQL in dev; migrates to SQLite when Electron packaging begins
- Invoice count bug fixed: only counts rows where col_b is a datetime
- Net op bug fixed: `_period_from_actuals` now uses `total_expenses` from QB

## Roadmap Order
1. Phase 3d — Balance Sheet ending balances
2. Phase 3c-deferred — Debt repayments + asset purchase/sale cash flow rows
3. Phase 4 — Targets & Scoring / Scoreboard
4. Phase 4b — Scenario Sandbox
5. Phase 5 — PDF + JSON exports
