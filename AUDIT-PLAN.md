# Audit Remediation Plan — approved 2026-09-16

Findings from the 2026-09-16 code audit. Approved scope: **fixes 1, 2 and the
cleanup**. The deliverable-formatting findings (4, 5, 6 in the audit) are
**deliberately deferred** — the client delivery layer is being redesigned around
client-centred HTML dashboards / scrolly presentations, so polishing the current
PDF would be thrown away.

Status: **not started.** Begin with migration 032.

**Amended 2026-09-16 (Phase 7).** The
deliverable-formatting findings are now obsolete rather than deferred: the Reports pages are
being deleted, taking several of the thirteen formatters with them. Two items JOIN this
cleanup: delete `Scoreboard.jsx` and `ReportCard.jsx`, and add depreciation to the target
model. See `PHASE-7-PRESENTATION.md`.

---

## Fix 1 — mapping identity gains `section`

**The bug.** Two accounts with the same name in different P&L sections collapse
into one mapping. `suggest_mappings` looks up saved mappings by
`(report_type, qb_account_name)`, and the unique constraint on
`account_mappings` is `(client_id, report_type, qb_account_name)` — so
"Supplies" under COGS and "Supplies" under Expenses cannot hold different
categories.

Proven on the real code path:

```
no saved mapping:                cost_of_sales 100.00 | overhead  50.00
after mapping the overhead row:  cost_of_sales   0.00 | overhead 150.00
```

Cost of Sales empties into Overhead. **The QuickBooks tie-out cannot catch
this** — COS and overhead both reduce net profit equally, so net profit still
ties while gross profit and every margin are wrong. Silent, and the safety net
is blind to it.

`MappingReview.jsx:121` already keys UI state by `section::account_name`, so the
advisor *can* set the two rows differently on screen. `MappingReview.jsx:147`
then collapses them to `report_type::account_name`, last write wins. The screen
knows the rows are distinct; the payload throws it away.

**The fix.**

1. **Migration 032.** Add `section` to `account_mappings`; backfill from each
   client's stored `raw_data.rows` (where section lives); swap the unique
   constraint to `(client_id, report_type, section, qb_account_name)`. Where one
   name appears in several sections, write one row per section, each keeping
   today's category — behaviour is identical the moment it lands, and splitting
   becomes possible rather than automatic.
2. **Two-tier lookup**, so the migration does not have to be perfect.
   `suggest_mappings` tries `(report_type, section, name)` first, then falls back
   to `(report_type, "", name)`. A mapping that could not be backfilled (account
   no longer present in any stored import) keeps working as a legacy catch-all
   and heals itself on the next confirm — the same self-healing shape
   `RETIRED_CATEGORIES` already uses.
3. `_client_mappings` keys by section.
4. `MappingDecision` gains `section`; `confirm_import` upserts on it.
5. `MappingReview.jsx` drops the dedupe and sends `row.section`.
6. **Regression test** in `verify_category_totals.py`: the Supplies
   COGS/Expenses case. It fails today.

**Open question carried into the build — section only, or section + subsection?**
The parser stores leaf names (`raw_row[0].strip()`), so within one section two
sub-accounts under different parents can still share a name and a mapping.
Section alone fixes the case that moves money between categories
(COGS → Overhead). Adding subsection would also let "Insurance" under Payroll be
split from "Insurance" under Overhead — but subsection is inferred from header
heuristics, so it is likelier to shift between exports and silently drop a saved
mapping.

**Recommendation: section only**, with "store the full account path
(parent:child)" backlogged as the real fix. Not yet decided by Chad.

---

## Fix 2 — keyword overrides must respect the statement

**The bug.** `_KEYWORD_OVERRIDES` in `auto_mapper.py` fires before section
context and guards only `depreciation_amortization` and `net_profit_for_year`.
Run against the real mapper:

```
liabilities  Payroll Taxes Payable  -> payroll_expenses    conf=high
liabilities  Accrued Payroll Fees   -> payroll_expenses    conf=high
assets       Prepaid Advertising    -> marketing_expenses  conf=high
```

"Payroll Taxes Payable" is stock QuickBooks. A liability balance is added to
monthly payroll expense — and because confidence is `high`, `needs_review` is
false, so Review Mapping never flags it. Latent on Vetter's chart of accounts;
it fires on client #2. The tie-out would catch it, but only after an import.

**The fix.**

1. Replace the two ad-hoc guards with a category → statement map, so a P&L
   category can never attach to a balance-sheet row.
2. An unrecognised **balance-sheet** row currently falls through to
   `suggested_category: "overhead_expenses"` — a P&L category. Confirmed blind,
   that drops a balance into expenses. Default unknown rows to a catch-all in the
   right statement (assets → other current assets, liabilities → other current
   liabilities, equity → equity), still flagged `needs_review`.
3. Tests for each case.

---

## Cleanup

**Dead schema — migration 033.** Drop `account_mappings.is_excluded` and
`owner_tax_savings` from both `forecast_configs` and `forecast_periods` (always 0
since migration 023), plus the ~10 places that plumb them.

Leave the `owner_total_draws` / `owner_distributions` duplication alone —
`owner_total_draws` is a live Scoreboard metric key and untangling it costs more
than it returns right now.

**Dead code.**

- `engine/owner_draws.py` — adds a constant zero since 023.
- `calculate_overhead(month=...)` — parameter never used.
- `category_totals._PL_SECTIONS` — defined, never referenced.
- The P&L/BS section sets are defined four times (`category_totals:39`,
  `ingestion:209`, `auto_mapper:112` rebuilt per call, `auto_mapper:224`) → one
  shared constant.
- `_client_mappings()` exists and is then re-inlined twice in `ingestion.py`.
- `period_sort_key` defined twice in `ingestion.py`.
- `source_files` assigned and never read (`ingestion.py:177`).
- `ConfirmRequest.periods[].categories` — the browser still computes and ships a
  full category dict the server explicitly discards. The `confirm_import`
  docstring still claims those figures are authoritative, two lines above the
  comment saying they are ignored.

**Presence, not truthiness.**

- `_tie_out`: `if qb_ytd == 0: continue` → `is None`. The house pattern violated
  inside the check that guards everything else.
- Same shape in `_aggregate_actuals` (`!= 0` for net profit and owner draws).
- The three JS `total_expenses || fallback` copies fold into one
  `lib/actuals.js`. `calcs()` already exists in `ActualsHistory.jsx` — the
  extraction was started and the other two pages never adopted it.

**Docs.** Correct CLAUDE.md's two reversed rules:

- line 364, "Overhead is a plug/residual … Never sum accounts directly into
  overhead" — reversed by migration 030.
- Module 4's "Net CF = Net Profit − Owner Draws + …" — reversed by migration 029;
  the code adds signed owner activity.

CLAUDE.md was last touched 2026-05-29. A fresh session reads it first and would
faithfully re-break both.

**Delete, pending confirmation of the list:** `ORDOBOOK-progress-dashboard.html`
(1,241 lines, 2026-03-05, a rival tracker to `ordobook-tracker.html`),
`TEST-RUN-CHECKLIST.md` (still instructs that overhead "is basically a plug
figure"), `DEMO-CHECKLIST.md`, `ORDOBOOK-project-notes.md`, `mockups/`,
`branding/ordobook-logo-workshop.html`, and `start.sh`.

`start.sh` is the one that matters: unreferenced, hardcodes
`/Users/Shared/Claude-Projects/…`, and launches `uvicorn --reload` with no
stop-first step — precisely the failure mode `ordobook-update.command` exists to
prevent. Three broken launches came from that.

Keep `SETUP.md` and the real branding assets.

---

## Sequencing

Four commits, each gated behind one `set -e` script running the four verify
scripts plus the frontend build:

1. Mapping identity (032 + mapper + ingestion + frontend + regression test)
2. Auto-mapper statement guards
3. Dead code + migration 033
4. Docs

**Chad must pull with `./ordobook-update.command`** (stop → pull → launch), since
032 and 033 run on launch.

---

## Carried forward, not in this scope

**Depreciation is missing from every deliverable surface** — absent from
`SCOREBOARD_METRICS`, `engine/targets.py`, `ReportCard.jsx` and the PDF. This is
**not** a reporting problem: the target P&L is
`gross_profit − payroll − marketing − overhead`, so every target Net Operating
Profit and Net Profit is overstated by full-year depreciation, and the Scoreboard
grades against it. A reporting redesign will not touch this. Carry it into the
delivery design session as a data question, not a layout one.

**The redesign has a good foundation.** `exports.py` is a thin adapter over
`ScoreboardResponse`. HTML dashboards or a scrolly presentation would be a new
consumer of that same JSON, not a rewrite of the engine — which is also the
Product 2 handoff shape CLAUDE.md describes. The redesign may end up defining
that contract.
