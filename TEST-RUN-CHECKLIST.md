# Phase 3a Test Run Checklist
> Use this during the Vetter Plumbing January 2026 verification run.
> Mark each item ✅ / ❌ / ⚠️ as you go.
> Add notes inline — anything that feels off, looks wrong, or could be improved.

---

## 1. App Boot & Navigation

- [ ] http://localhost:5173 loads without errors
YES
- [ ] Client Roster screen renders correctly
YES
- [ ] Vetter Plumbing appears in the roster (or can be created)
YES
- [ ] Clicking into Vetter Plumbing loads the workspace
YES
- [ ] Left sidebar shows correct client name and nav links
YES
- [ ] **Forecast** link appears in the sidebar and is clickable
YES

**UI notes:**
> _Write anything here — labels, spacing, colors, confusing flows, etc._
>Total other expenses needs to be editable and add to a total of Total Expenses, and then Total Expenses minus COS minus Payroll, minus depreciation , minus marketing equals Overhead which is basically a plug figure.

I want a button on the left side of the forecast cells that copies the first cell across  the row and autofills the rest of the cells in that row with the same number.

---

## 2. Forecast Drivers Page — Initial Load

- [ ] Page loads without errors
YES
- [ ] All 7 sections render:
  - [ ] Revenue Model
YES
  - [ ] Cost of Sales
YES
  - [ ] Payroll
YES
  - [ ] Other Expenses (Marketing, Depreciation)
YES
  - [ ] Overhead Items
I don't see an overhead items section

  - [ ] Other Income / Expense
YES
  - [ ] P&L Summary
YES
- [ ] Month columns display correctly (Jan–Dec 2026)
YES
- [ ] If actuals imported: those month columns are **gray / locked / non-editable**
NOT TESTED OR SEEN, BUT I DON'T WANT THE CELLS LOCKED, THERE MAY BE AN ISSUE IMPORTING TO ACTUALS BECAUSE CURRENTLY THE PAY RUN NUMBERS FOR JANUARY AND FEBRUARY ARE LOCKED BUT I DON'T THINK THERE WAS INFO TO IMPORT
- [ ] Forecast months are editable (inputs respond to click/type)
YES, BUT I WOULD LIKE WHEN I CLICK IN THE BOX FOR IT TO AUTO SELECT ALL SO THAT I CAN JUST TYPE AND IT WILL REPLACE THE CONTENTS
- [ ] Recalculate button is visible
YES AND WORKING!

**UI notes:**
>I want each cell in each row to be individually editable, like the average job values currently  all change when I change one, which is a good starting place, but I want to be able to change one month also without it changing all of them

---

## 3. Revenue Model — Data Entry

Open Excel workbook → Revenue tab for January 2026.

| Driver | Excel Value | Entered | Match? |
|--------|-------------|---------|--------|
| Small job count (Jan) | | | |
| Small job avg value ($) | | | |
| Medium job count (Jan) | | | |
| Medium job avg value ($) | | | |
| Large job count (Jan) | | | |
| Large job avg value ($) | | | |

- [ ] Input fields accept numeric entry without issues
YES
- [ ] Tab / Enter navigation between fields works as expected
YES

**UI notes:**
>

---

## 4. Cost of Sales — Data Entry

Compute from workbook: `COS ÷ Revenue × 100 = ____%`

| Driver | Excel Value | Entered | Match? |
|--------|-------------|---------|--------|
| COS % (Jan) | | | |

**UI notes:**
>

---

## 5. Payroll — Data Entry

| Driver | Excel Value | Entered | Match? |
|--------|-------------|---------|--------|
| Cost per pay run ($) | | | |
| Pay runs in January (#) | | | |
| One-off payroll items ($) | | | |

**UI notes:**
>

---

## 6. Other Expenses — Data Entry

| Driver | Excel Value | Entered | Match? |
|--------|-------------|---------|--------|
| Marketing / advertising ($) | | | |
| Depreciation & amortization ($) | | | |

**UI notes:**
>

---

## 7. Other Income / Expense — Data Entry

| Driver | Excel Value | Entered | Match? |
|--------|-------------|---------|--------|
| Net other income/expense ($) | | | |
| _(positive = income, negative = expense)_ | | | |

**UI notes:**
>

---

## 8. Owner Draws — Data Entry

| Driver | Excel Value | Entered | Match? |
|--------|-------------|---------|--------|
| Owner distributions ($) | | | |
| Owner tax savings ($) | | | |

**UI notes:**
>

---

## 9. Hit Recalculate — Output Verification

After clicking **Recalculate**, compare calculated rows to Excel for January 2026.

| Line Item | Excel Value | App Output | Match? |
|-----------|-------------|------------|--------|
| Total Revenue | | | |
| Cost of Sales | | | |
| Gross Profit | | | |
| Gross Margin % | | | |
| Total Payroll | | | |
| Marketing | | | |
| Depreciation | | | |
| Total Other Expenses (Overhead) | | | |
| Other Income / Expense | | | |
| Net Operating Profit | | | |
| Owner Draws | | | |
| Net Profit | | | |

- [ ] All values match Excel (rounding within $1 acceptable)
- [ ] P&L Summary section updates after recalculate

**If a number is wrong, note it here:**
>

---

## 10. Save & Reload Test

- [ ] Save / commit the forecast config
- [ ] Refresh the page (F5 or cmd+R)
- [ ] All entered values are still present after reload
- [ ] Calculated values are still correct after reload

**UI notes:**
>

---

## 11. General UX Observations

Use this section freely during the whole test run.

### Things that felt confusing or unclear
>

### Labels or terminology that should change
>

### Visual / layout issues
>

### Flows that felt slow or required too many clicks
>

### Things that worked really well (keep these)
>

### Ideas that came up during testing
>

---

## 12. Verdict

- [ ] **PASS** — numbers verified, proceed to Phase 3b
- [ ] **FAIL** — discrepancies found, debugging needed

**Phase 3b priority order (once verified):**
1. Overhead line items UI (add/edit named rows with per-month amounts)
2. 12-month report view — read-only blended P&L (`/clients/:id/forecast/:year/report`)
3. Audit trail Level 1 — hover tooltip showing top-level formula for any calc value

**Debugging starting points if numbers are wrong:**
- `backend/app/engine/forecast.py` → `_period_from_drivers()`
- `backend/app/engine/revenue.py` → job count × avg value
- `backend/app/engine/payroll.py` → runs × cost_per_run
- Check calc_trace: `GET http://127.0.0.1:8000/api/clients/{id}/forecast/2026/1/trace`

---

_Generated: 2026-03-10 | Phase 3a verification run_
