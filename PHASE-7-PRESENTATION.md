# PHASE 7 — One Workspace, One Deliverable

> **Decided 2026-09-16.** The Reports section is retired into the Workspace, and the
> monthly client deliverable becomes a generated, panel-based presentation the advisor
> edits, presents, and emails. Scoreboard and Report Card are deleted as pages; the
> controls they carried move into the Presentation tab.
>
> **Status 2026-09-17:** Phase 0 (audit plumbing) SHIPPED — migrations 032/033.
> Phase 7.1 (one workspace, five tabs) SHIPPED. Next: 7.2, the panel schema and
> generator.

---

## Why

ORDOBOOK stops being *an app that makes reports* and becomes *a workspace that produces
one deliverable*. The advisor's month runs import → parse → forecast → evaluate against
targets → design the presentation → present it → deliver it. The tabs should be that
sequence.

The negative case matters as much as the positive one: **a reorganized P&L grid is
negative value.** The client can pull that from QuickBooks in ten seconds, and handing
them a worse-looking version of it spends the advisor's credibility. Every deliverable
must be something the client could not have made themselves — judgment, narrative and
priority, not data rendering.

This does not reverse the Workspace/Reports split decided 2026-04-05. That split was
always "analyst density vs. client-ready," which is a **mode**, not a **place**.
Presenter view is the same distinction with the seam in a better spot.

### Where the design came from

A whiteboard the advisor's wife drew on 2026-09-16, playing the client. Her arc:

    WHERE WE WERE  →  WHERE WE ARE  →  WHERE WE'RE GOING  →  ACTION PLAN

What she left out is the loudest signal in it: no balance sheet, no P&L, no
DSO/DIO/DPO table, no month-by-month grid, no 18-metric scoreboard. The entire
client-facing surface is seven sparse panels. The value being added is the
**selection**, and selection is only visible when most things are left out.

She also cut the cash-flow waterfall that the 2026-09-16 prototype
(`prototypes/client-review-scrolly.html`) had built its centrepiece around. She was
right: the waterfall is an **advisor** instrument and belongs in the Workspace. The
prototype was built for the accountant in the room, not the client.

---

## The one structural idea

**A presentation is data, not a document.** An ordered list of typed panels, each
holding bound figures plus authored prose.

Once that is the shape, everything downstream is the same small problem:

| Operation | What it becomes |
|---|---|
| Generate | pick a default panel sequence, fill it |
| Edit | edit one panel's prose, or drop the panel |
| Reorder | move items in a list |
| Present | render the list without chrome |
| Export | render the list to a file |
| Card library (later) | "insert a panel of type X" — just another entry point |

Compare with "a customizable HTML screen," which has no schema: a free-text blob that
cannot be regenerated, diffed, versioned or safely re-rendered.

The circled **×3** on the Action Plan panel of the whiteboard is cardinality, drawn.

---

## Panel types

Seven types; two are parameterized by a count. This is a small **closed** set, which is
what makes the generator tractable.

| Panel | Repeats | Source |
|---|---|---|
| `action_review` — last month's steps, checked off | once | Action Plan + `completed_at` |
| `highlights` — two or three year-over-year callouts | once | actuals vs prior year |
| `health_bar` — one stacked green/yellow/red bar | once | scoreboard grade counts |
| `exception` — one metric: chip, chart, note | **×N** | non-green metrics (see rule below) |
| `three_column` — actual / forecast / target | once | targets model |
| `objective` — one goal, starts, assigned, due | **×3** | Action Plan |
| `close` — the delivery beat | once | — |

### `health_bar` is the Scoreboard's replacement

One bar — on the whiteboard, 60% green / 30% yellow / 10% red — and then **only the
exceptions get a panel**. No green metric is ever shown individually. The whole
18-KPI grid compressed to one glance plus the two or three things worth discussing.

The data already exists: the Scoreboard summary banner computes overall grade and
counts today. The grading engine is untouched; it simply gains a new renderer.

### Which metrics become `exception` panels

**All reds, plus any yellow the advisor flags.** (Decided 2026-09-16.) Reds are
automatic; yellows are a per-metric opt-in, so the advisor keeps editorial control
without a decision on all eighteen every month.

### Grade and direction are two different things

On the whiteboard, "Job cost average" appears in `highlights` as **down .8%** (good)
*and* as a **red** `exception`. Improving, and still off plan.

The model can derive this today (prior year and target are both stored) but does not
treat direction as first-class. The `exception` panel needs both, and they must be
allowed to disagree — "you're behind but you're moving" is a completely different
conversation from "you're behind and stuck." Add direction-vs-prior-year as a field
alongside grade.

---

## Bound vs. authored

Every panel declares itself one of two kinds:

- **Bound** — regenerates from data, never hand-edited.
- **Authored** — never regenerates, but raises a *"the figures under this changed"*
  flag when its inputs move.

This is "presence, not truthiness" one level up, and it must be decided before any
advisor writes real prose into a presentation — retrofitting it afterwards is painful.

## Workspace snapshots (decided 2026-09-17)

Versioning extends past the presentation to the **whole Workspace**. A "save version"
freezes a view-only backup of every tab, so the advisor can open a month from three
months ago and see not just what was presented but **the forecast that stood at the
time**.

**Store the outputs, not the inputs.** It is tempting to snapshot the driver config and
re-derive on demand — but the engine changes. Re-deriving a March snapshot with
September's engine answers "what would March look like today," which is a different and
much less useful question than "what did I show the client in March." A snapshot is
frozen rendered output; the presentation freezing below is one case of the same rule.

A snapshot is read-only, named, and dated. Opening one puts the Workspace in a clearly
marked historical mode with no editable fields.

## PDF from any tab (decided 2026-09-17)

Once the tabs are unified, "Generate PDF" is available from every one of them, not just
the deliverable. The Workspace tabs print for the advisor's own records and working
papers; the Presentation prints as the client deliverable.

## A presented presentation freezes

A presentation belongs to a period and becomes immutable once presented. It is the
record of what was said in that meeting, and the `action_review` panel of the *next*
presentation reads from it. If presentations stay mutable, "what we committed to last
month" rots — and that is the panel the whole deliverable opens with.

---

## Tabs

Five, in workflow order:

    Actuals · Forecast · Targets · Action Items · Presentation

One left-nav section. `WorkspaceShell` and `ReportsShell` collapse into one shell.
Consider a divider in the strip between the working tabs and Presentation — the two
halves have genuinely different natures.

**Scoreboard is not a tab.** Both pages are gone (7.1). `Scoreboard.jsx` — the Concept-5
visual deliverable — was deleted outright, along with its now-orphaned print stylesheet;
the presentation replaces it. `ReportCard.jsx` turned out to already BE the select step,
so it was renamed to `Presentation.jsx` rather than rewritten: every working control
(grade override, priority toggle, notes, recalculate) survives untouched.

Actuals and Forecast each have two lenses on one set of numbers, so they carry a
**Working / Clean** toggle in the tab bar rather than tabs of their own — the same
mode-not-place idea, expressed where it belongs. `ReportsActuals.jsx` and
`ForecastReport.jsx` live on as the Clean lens.

What the old pages carried:

| Carried by the old pages | New home |
|---|---|
| Manual grade override (★) | Presentation — the "select" step |
| Top-3 priority selection | Presentation — becomes `exception` panel selection |
| Yellow flagging | Presentation — same surface as the override |
| `priority_reason`, `action_item` text | Presentation — authored panel prose |
| Private per-metric notes | stays with the metric; never exported |

**Targets sets the bar. Presentation decides what to say about it.** The Scoreboard is
not so much deleted as demoted from deliverable to control panel, living inside the
thing it controls.

Module 5's three PDF exports become legacy. "PDF" comes to mean "print this
presentation" — do not maintain both.

---

## Delivery

A **self-contained HTML file**, fonts inlined, opening offline as an email attachment.

Not a hosted URL, and not HTML in an email body (mail clients strip scripts and most
CSS; an attachment opens in a browser and works).

Hosting collides head-on with the CLAUDE.md non-negotiable that client financial data
never leaves the advisor's machine. A hosted link *is* Product 2 arriving early through
a side door. It may well be right later — but as a decision, not a drift.

---

## Sequence

0. **Plumbing** — `AUDIT-PLAN.md` fixes 1 and 2 plus cleanup. Upstream of every screen,
   and it matters more now: if the presentation is all the client sees, a mapping error
   reaches them wearing a narrative.
1. **One workspace** — collapse the shells, five tabs, delete the two scoreboard pages.
   Mostly mechanical; the routes are shallow and the pages move as-is.
2. **Panel schema + generator** — fixed sequence, prose editable, figures bound. The
   real build.
3. **Presenter view** — same panel list, no chrome, screen-shareable.

   **Motion (decided 2026-09-17).** Panels move **horizontally**, not vertically. The
   left **third** of the window is pinned: text and figures for the current panel,
   cross-fading on transition. The right **two thirds** carries the panel elements
   scrolling in horizontally. Respect `prefers-reduced-motion` — cross-fade only, no
   travel.
4. **Export** — self-contained HTML.

Two small data additions along the way:

- **Depreciation into the target model.** It is absent from `SCOREBOARD_METRICS`,
  `engine/targets.py`, `ReportCard.jsx` and the PDF, so `net_op_profit` is computed as
  `gross_profit − payroll − marketing − overhead` and every target is overstated by
  full-year depreciation. If the grading engine survives as a service, this bug
  survives into every presentation.
- **Direction-vs-prior-year** as a first-class field beside grade.

### Explicitly not now

- **The drag-and-drop card library.** It is the most fun part and the least
  load-bearing. A generic composer means a data catalog, card types, a layout engine,
  persistence and versioning — while "generate automatically, then let me fix the
  words" delivers most of the value. Ship v1, use it for three months, and the eighth
  panel you keep wishing for will name itself.
- **Hosted links.** See Delivery.
- **The client mobile app** that tracks action items against a cloud instance. Product 2.

---

## Open question for the client-side reviewer

The whiteboard's middle column reads **YTD FORECAST** beside **YTD ACTUAL** and
**EOY TARGET**. If the forecast column really is year-to-date it is nearly tautological
— for closed months, actual *is* the forecast. The meaningful version is YTD actual →
**full-year** forecast → EOY target: "here's what we've done, here's where we'll land,
here's where we said we'd land." Revenue at 375 / 524 / 800 tells that story cleanly.

**Resolved 2026-09-17: full year.** YTD actual → full-year forecast → EOY target. The
whiteboard was about the visuals rather than a strict data spec; exactly which metrics
belong in `three_column` gets decided once there is a working version to look at.
