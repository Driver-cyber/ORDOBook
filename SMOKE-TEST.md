# SMOKE TEST — 2026-09-11 builds

Combined check for everything shipped on 2026-09-11, ordered by screen so you can walk the app
once. Newest builds first within each screen; the older builds are re-checks. Tick as you go and
note anything off — a wrong number matters more than a rough edge.

Builds covered: owner distributions (026) · capex for actuals months · pinned headers · Batch 4 ·
grid restyle · Batch 5 Action Plan (027) · Scoreboard text (028).

## 0. Pull and relaunch

```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
git fetch origin claude/add-project-tracker-zGrFN
git checkout origin/claude/add-project-tracker-zGrFN -- $(git diff --name-only a27774b origin/claude/add-project-tracker-zGrFN)
./ordobook-stop.command
```

Then relaunch from the Dock. If it stalls on "Starting backend", tail `backend.log` — you should
see `026 -> 027` and `027 -> 028`.

- [ ] Backend log shows both migrations applied; window opens.

## 1. Sidebar (Batch 4)
- [ ] Collapse from the footer button. Icons only; hover shows the name. Navigate to three screens; it
      stays collapsed. Reload; still collapsed. Expand it again.
- [ ] Collapsed: the client's initial sits where the name was; clicking it goes to the roster.

## 2. Workspace → Actuals (Batch 4 + restyle)
- [ ] Opens on the year grid for the latest year with data. Arrows step through years; the year
      dropdown works.
- [ ] Grid sits on a white card, hairline under each row, totals black on a faint band.
- [ ] Scroll down: month headers stay pinned. Scroll right: the label column stays pinned.
- [ ] Click a month header — opens that month's detail page.
- [ ] "List View" shows the old one-row-per-period list, newest first. Reload — it remembers.
      Switch back to Grid.
- [ ] Equity section shows "Owner Investments / (Distributions)" (026) with the balances you
      verified; Total Equity still ties to Total Liabilities & Equity.
- [ ] If you had drafts: "Confirm All (n)" in the top bar confirms them and the Forecast refreshes.

## 3. Month detail (Batch 4 + 026)
- [ ] Change the job count, click away: "saved ✓" appears; reload and it stuck. Enter also saves.
- [ ] Equity block lists the owner line; Total Equity includes it.

## 4. Workspace → Forecast (026 · capex · pinned headers · Batch 4 · restyle)
- [ ] Hit **Sync Actuals** once (needed so capex fills in for already-imported months).
- [ ] Capex row: Feb 2026 reads 126 if no depreciation was booked that month, otherwise 126 plus
      that month's depreciation. A dash only appears for a month with no prior balance.
- [ ] Owner Distributions row shows the derived monthly draw in actuals months (now NEGATIVE = draw, see §12)
      and matches your manual calc for January and after.
- [ ] Net Cash Flow in actuals months moved by the draw and capex amounts.
- [ ] Month header pins while scrolling; the page title and buttons stay put above the grid.
- [ ] Click the small "i" beside DSO, Owner Distributions, Capex, Long-Term Debt Change. Read one
      fully; Esc or click-away closes it. Sign conventions read the way you think about them.
- [ ] White card, hairline rows, black totals; actuals cells a shade quieter than forecast cells but
      readable. Editable cells still rest on the compact figure ($14.9k) and expand on click.
- [ ] Horizontal scrollbar is visible without scrolling first.

## 5. Reports → Forecast (restyle)
- [ ] Same card look; month header pins while scrolling.

## 6. Reports → Actuals (026)
- [ ] Equity section lists "Owner Investments / (Distributions)".

## 7. Workspace → Targets (026)
- [ ] Prior-year column: Owner Investments/(Draws) equals the prior year's December balance
      (signed, draws negative). Projected Balance Sheet still ties.

## 8. Reports → Scoreboard (028)
- [ ] Hover the headline under the client name: dashed underline. Click, type your own line,
      press Enter. It stays after reload.
- [ ] Hover it again: the ↺ appears. Click ↺ — the auto headline returns.
- [ ] With at least one top priority set: click a priority's reason, write one, click away. Do the
      same for its action item on the right.
- [ ] Empty a field and blur — the auto wording comes back.
- [ ] **Export PDF** — headline, reason and action item print exactly as on screen.
- [ ] Owner Investments/(Draws) grades as signed cash (a draw over target reads red).

## 9. Reports → Action Plan (Batch 5)
- [ ] Your existing items appear as numbered objectives, each with one action item carrying the
      old next steps, owner and due date. Private ★ notes are still there.
- [ ] Objective text and Current results grow as you type; Enter saves, Shift+Enter is a newline.
- [ ] "+ Action item" three times; the fourth is greyed out with the note. "+ Objective" greys out
      at three.
- [ ] Owner chips: "+ owner" opens the picker; tick two names. Type a new name and Add — it lands
      on the chip and in the header **Owners** roster.
- [ ] Header **Owners**: remove a name; it disappears from the picker but stays on any action item
      that already had it.
- [ ] Move an objective down, an action item up; reload — order held.
- [ ] Open ★ on the LAST objective: the popover is fully visible, not clipped.
- [ ] Delete an objective with action items: the confirm names the count; both go.
- [ ] **Export JSON**: `ordobook_version` is 1.1.0; each objective has `steps[]`; no `notes`.
- [ ] **Export PDF**: objective rows with indented action items, owners joined by commas.
- [ ] Profile & Settings → Action Plan Owners lists the roster; edit there, Save, and the picker
      reflects it.

## 10. Mapping (026, re-check)
- [ ] Review Mapping: the equity dropdown offers "Owner Investments / (Distributions)"; the
      distributions account is mapped to it and the auto-mapper suggests it for a fresh upload.

## 11. Follow-ups from the first pass (2026-09-13)

Pull, relaunch, then:

- [ ] **Scoreboard / Report Card:** Owner Investments/(Draws) YTD Actual and Full Year Forecast now
      read NEGATIVE for a year with draws (signed cash, same as the prior-year column and the
      target). Grade still red when draws exceed the target.
- [ ] **Workspace → Actuals:** month headers no longer show a ✓; only drafts carry "● draft".
- [ ] **Every wide grid** (Actuals, Forecast, Forecast Report): a slim grey scrollbar sits under the
      grid at all times when columns overflow. Drag its thumb, or click the track to jump. It
      disappears when the grid fits.
- [ ] **Forecast → DSO / DIO / DPO:** each row has a `days | $` toggle. In `$` the cells show the
      balance those days imply (AR, Inventory, AP) and actuals months show the imported balance.
      Type a dollar amount into a forecast month, click away: the row converts it back to days
      (check the `days` view) and the projected balance sheet AR/AP moves. The → autofill copies
      the first forecast month's DAYS in either mode.
- [ ] **Forecast month cards:** click any month header on the Workspace Forecast — a card view of
      that month opens (Income Statement, Cash Flow, Balance Sheet). ‹ › step months, Esc or
      ← Back returns to where you were. Same from the Forecast Report's headers. An actuals month
      shows "confirmed actual" and an "Imported actuals →" button to the QB detail.
- [ ] **Forecast Report → List View:** one row per month with Rev / NP / NCF and a source tag; a
      row opens its month card. The choice sticks after reload.
- [ ] **Action Plan:** on the last objective on a full screen, "+ owner" opens the picker UPWARD
      and it is fully visible; a long roster scrolls inside it.

## 12. Signed cash on the Forecast (2026-09-13, migration 029)

Update with the new one-command script (it stops first, pulls, then relaunches — 029 flips the
stored signs so every figure keeps its size):

```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
./ordobook-update.command
```

Then on the Workspace Forecast:

- [ ] Backend log shows `028 -> 029`. Hit **Sync Actuals** once.
- [ ] Owner Investments / (Draws): actuals months read NEGATIVE for a draw (e.g. Jan $-7.7k). Type
      `-5000` in a forecast month: it saves and Net Cash Flow for that month drops by 5,000.
- [ ] Capex: Feb 2026 reads $-126 (a purchase). Type `-3000` in a forecast month: Net Cash Flow
      drops by 3,000 and the projected Fixed Assets line rises by 3,000 less that month's
      depreciation.
- [ ] Other Current Assets Δ: type `-1000`: Net Cash Flow drops 1,000, projected Other Current
      Assets rises 1,000.
- [ ] Debt rows unchanged: a positive entry raises Net Cash Flow.
- [ ] Three new rows under DPO: Δ Accounts Receivable, Δ Inventory, Δ Accounts Payable. In `$`
      mode they are cash (AR up → negative). Flip a parent row to `days` and its Δ row shows the
      change in days from the month before.
- [ ] **The section foots:** for any forecast month, Net Profit + Owner + ΔAR + ΔInv + ΔAP + Capex
      + ΔOCA + Current Debt + LT Debt (all as displayed in `$`) = Net Cash Flow. Check one actuals
      month and one forecast month by hand.
- [ ] Forecast Report: same rows, same signs, "Owner Investments / (Draws)". Month card too.
- [ ] Scoreboard / Report Card: Owner Investments/(Draws) still negative for draws (no double flip).
      Scenario Sandbox: the field is now "Owner Investments / (Draws)" — enter a draw as negative.

## 13. Overhead drill-down — Part A: one account, one category (migrations 030)

Update, then relaunch. **Order matters here: do 13.1 before anything else**, because
it restates stored months and every later check reads those figures.

```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook"
./ordobook-update.command
```

### 13.1 Re-apply the mapping (the one that moves numbers)
- [ ] Backend log shows `029 -> 030`.
- [ ] Workspace → Actuals → **Re-apply Mapping** → confirm. A gold panel reports how many
      months were examined and how many changed, listing each month's net profit before and
      after.
- [ ] **Read that list against expectation.** A month should move only if it had an account
      mapped across sections (an expense-section account sent to Cost of Sales was being
      counted twice, so net profit goes UP by that amount) or an account you had marked
      Excluded. Months where everything was mapped normally should not move at all.
- [ ] **The green tie-out line at the bottom of the panel**: "Net profit ties to QuickBooks'
      own year-to-date net income in all N months". That compares the P&L we just computed
      against the Balance Sheet's equity net-income line — a different statement, so agreement
      means every P&L dollar is counted exactly once. If it comes back red, it lists each
      month and the difference; send that list over.
- [ ] Press it a second time: `0 changed`. It is idempotent.
- [ ] Spot-check one changed month against the QuickBooks P&L by hand as well.

### 13.2 Excluded is gone
- [ ] Review Mapping: the category dropdown no longer offers "Exclude this account".
- [ ] Any account you had excluded now shows a real category — an expense-section one should
      read Overhead Expenses, which is where its dollars were already landing.
- [ ] The Category Totals preview still moves as you change a dropdown, and Total Expenses
      equals Payroll + Marketing + Depreciation + Overhead.

### 13.3 The overhead schedule
- [ ] Workspace → Actuals grid: the **Overhead** figures are now clickable. Click one.
- [ ] The schedule lists every account mapped to Overhead for that month, with Last Month and
      a YTD Avg column (the header says how many months the average covers).
- [ ] The total row equals the Overhead figure on the grid, and the line underneath says it
      ties. If instead you get a gold "this schedule is X below/above the stored figure"
      panel, you skipped 13.1 — go run it.
- [ ] ‹ › step through months. Esc and ← Back both return to where you came from.
- [ ] Accounts are listed in **statement order — the same order as Review Mapping**, not
      alphabetically. Sub-accounts stay under their parent (the vehicles under Vehicle
      Expenses).
- [ ] An account mapped in from another statement section carries a small section tag. Check
      any tagged account is a deliberate reclass, not a mapping slip.
- [ ] A parent account like **Vehicle Expenses** appears as its own line. If QuickBooks posts
      directly to the parent it carries an amount; if it is only a heading it reads $0. Either
      way the total still ties — a real amount there is a direct posting, not a repeat of the
      sub-accounts below it.
- [ ] **Vehicle accounts** (2020 Toyota Tundra, 2023 Ford E-Series) appear in the January
      schedule with their expense amounts, and the fixed-asset side is untouched on the
      Balance Sheet. These were dropped by the first cut — an account name that appears on
      both statements was being collapsed to one category.
- [ ] Same drill-down from a month detail card (Overhead →) and from a confirmed month's
      forecast card.
- [ ] A month you have not imported shows "isn't imported" and lists the months you have.

> Part B (the editable Forecast overhead schedule) lands next; section 13 is complete when
> both halves pass together.

## If something is off
Note the screen, what you expected, and what you saw. Numbers first. A screenshot of the grid
with the month header visible is enough for most of these.
