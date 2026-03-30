# NEXT SESSION — Boot Checklist
> Last updated: 2026-03-27 | Phase 3d complete (018), Phase 4 is next

---

## Where We Are

- Phase 3d: ✅ Projected Balance Sheet — migration 018
  - 8 new forecast_periods fields (cash, fixed assets, total CA, total assets, total CL, total liabilities, equity)
  - Opening balance seeded from prior fiscal year Dec actuals before month 1-12 loop
  - Actuals months: read directly from monthly_actuals; forecast months: rolled forward
  - ForecastReport now shows full Projected Balance Sheet with totals + equity row
- QB parser hardening: ✅ flexible header detection + period label normalization ("As of Dec 31, 2024" → "December 2024")
- Workspace buttons: ✅ "Actuals History" + "Review Mapping" added to ClientWorkspace header
- ActualsHistory: ✅ "Review Mapping" button — reconstructs mapping view from stored raw_data
- New backend endpoint: `GET /api/clients/{id}/actuals/mapping-review-data`

**Next up: Phase 4 — Targets & Scoring / Scoreboard**

---

## Step 1 — Launch

Click **ORDOBOOK** in the Dock. It will:
- Start Postgres via pg_ctl
- Open backend terminal (uvicorn)
- Open frontend terminal (npm run dev)
- Open Chrome to localhost:5173 after 3s

Manual fallback if needed:
```bash
# Postgres
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 start

# Backend
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
source venv/bin/activate && uvicorn app.main:app --reload

# Frontend
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/frontend"
npm run dev
```

---

## Phase 4 Plan (to be confirmed)

### Module 4 — Scoring & Targets
- Annual targets per KPI per client (stored in DB, per fiscal year)
- Grade assignment: Green / Yellow / Red per metric per period
- Scoreboard view: visual summary — grades, YTD actuals vs. target, variance %
- Key metrics to score: Revenue, Gross Profit %, Net Operating Profit, Net Cash Flow, Job Count

### Data model additions needed:
- `targets` table: client_id, fiscal_year, metric_name, target_value
- `scorecard_grades` table (or column on forecast_periods): grade per metric per month
- OR: keep grades simple — computed on the fly from actuals vs. targets, no separate storage

### UX:
- Targets UI in Client Profile & Settings (set once per year)
- Scoreboard view: monthly grid, color-coded cells (green/yellow/red)
- Grade thresholds: TBD (likely % of target: ≥100% = green, 85–99% = yellow, <85% = red)

---

## Key Notes

- Light theme: DO NOT reintroduce dark hex values (`#1a1d22`, `#0e0f11`, etc.)
- Owner draws / tax savings are balance sheet items — do NOT reduce Net Income
- Net Cash Flow = Net Profit − Owner Distributions − Tax Savings − WC changes − CapEx ± debt
- Projected equity = Total Assets − Total Liabilities (not from equity_before_net_profit)
- prior_projected now includes: projected_cash, projected_fixed_assets, projected_other_lt_assets,
  projected_equity (in addition to the Phase 3c keys)
- QB Balance Sheet header detection: falls back to finding first row with month-name columns
- QB period normalization: "As of Dec 31, 2024" → "December 2024" (handled in parser)
- DO NOT use `brew services` for Postgres — stale pid issue; use pg_ctl directly

## Roadmap Order
1. ✅ Phase 3c-deferred — full cash flow (done 2026-03-23)
2. ✅ Phase 3d — Projected Balance Sheet (done 2026-03-27)
3. **Phase 4** — Targets & Scoring / Scoreboard
4. Phase 4b — Scenario Sandbox
5. Phase 5 — PDF + JSON exports
