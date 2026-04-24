# ORDOBOOK Demo Checklist
> Run through this before signing off on Phase 6 packaging.
> Any screen that breaks = bug to fix before we move on.

---

## Before You Start
- [ ] App is running (Postgres, uvicorn, npm run dev, Chrome at localhost:5173)
- [ ] Vetter Plumbing client exists with at least a few months of actuals imported

---

## 1. Import
- [ ] Drag a QB Balance Sheet .xlsx onto the import zone
- [ ] Drag a QB P&L .xlsx
- [ ] Account mapping screen appears — spot-check a few accounts look right
- [ ] Confirm import, data shows up as a new period
- [ ] Try importing a month that's already been imported — confirm it updates without duplicating

## 2. Workspace → Actuals Tab
- [ ] Navigate to Vetter Plumbing → Workspace → Actuals
- [ ] Revenue, Gross Profit, Net Profit numbers look correct vs. QB
- [ ] Cash flow metrics (DSO, DIO, DPO) appear
- [ ] Switching between months works
- [ ] Hover tooltips on calculated values appear (Level 1 audit trail)

## 3. Workspace → Forecast Drivers Tab
- [ ] Page loads with existing driver data for current year
- [ ] Change a job count in one month — forecast numbers update
- [ ] Change avg job value — revenue updates correctly
- [ ] Change a payroll driver — net profit updates
- [ ] Save persists (reload page, change is still there)

## 4. Workspace → Targets Tab
- [ ] Targets page loads for current year
- [ ] Year picker (previous / current / next) works
- [ ] Edit a driver field (e.g. Total Jobs) — computed fields update (Revenue = Jobs × Avg Value)
- [ ] Save persists

## 5. Scoreboard (Reports tab)
- [ ] Scoreboard loads with correct year
- [ ] All 18 KPI rows show Prior Year / YTD / Forecast / Target / Grade
- [ ] Grade pills are green/yellow/red as expected
- [ ] Summary banner (overall grade, top priorities) appears
- [ ] Click a grade pill to manually override — star appears, override persists on reload
- [ ] Export JSON button — downloads a .json file, open it and confirm it looks right
- [ ] Export PDF button — downloads a .pdf (if WeasyPrint installed in venv; skip if 503)

## 6. Reports → Actuals Tab
- [ ] Clean Balance Sheet + P&L loads
- [ ] Period dropdown lets you switch months
- [ ] Numbers match what's in Workspace Actuals for the same period
- [ ] Negative values show in parentheses format

## 7. Reports → Forecast Tab
- [ ] 12-month forecast table loads
- [ ] Actuals months and forecast months both appear
- [ ] Numbers look reasonable given the drivers you set

## 8. Scenario Sandbox
- [ ] Navigate to Scenarios in sidebar
- [ ] Three scenario columns appear
- [ ] Change a driver in one scenario — that column's outputs update, others unchanged
- [ ] Quarterly breakdown toggle works
- [ ] Client View toggle hides input rows, shows clean output summary

## 9. Action Plan (Reports tab)
- [ ] Action Plan tab loads (may be empty for current year — that's fine)
- [ ] Add a new item with the "+ Add Item" row
- [ ] Click into Objective cell and type — saves on blur
- [ ] Edit Next Steps, Owner, Due Date inline
- [ ] Private note (★ icon) — open popover, type a note, save — note persists
- [ ] Delete an item (trash icon on hover)
- [ ] Export JSON — downloads file, check action_plan section is populated
- [ ] Export PDF — downloads action plan PDF

## 10. Client Profile
- [ ] Navigate to Client Profile
- [ ] Name, industry, fiscal year start editable
- [ ] Advisor private notes field visible and editable
- [ ] Changes persist on reload

---

## After the Demo

For any item that breaks, note it here and we fix it before packaging:

| Screen | What broke | Notes |
|--------|-----------|-------|
| | | |

Once all items are checked: **tell Claude you're ready for Phase 6b — Electron shell.**
