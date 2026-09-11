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
- [ ] Owner Distributions row shows the derived monthly draw in actuals months (positive = draw)
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

## If something is off
Note the screen, what you expected, and what you saw. Numbers first. A screenshot of the grid
with the month header visible is enough for most of these.
