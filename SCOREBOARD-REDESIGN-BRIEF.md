# Scoreboard Redesign — Design Brainstorm Brief

> **Purpose of this document:** This is a self-contained brief to paste into a **fresh Claude chat** for design brainstorming. The goal of that session is to explore visual concepts for a new client-facing report and bring back a chosen direction (with enough spec for an implementation session to build from).
>
> **Scope of the brainstorm session:** Visual design only. HTML/CSS mockups, layout sketches, color/typography exploration. **No backend changes, no data model changes, no engine work.** All the data already exists — we are designing a new lens on it.

---

## 1. Who I am (the user) and what ORDOBOOK is

I'm a solo financial advisor / fractional CFO. I built **ORDOBOOK** — a local-first desktop app — to replace the Excel workbook I currently use to do monthly close, run forecasts, and produce client deliverables.

The product's deeper truth (from my project constitution):

> ORDOBOOK is not a financial reporting tool. It is a **human progress tool that uses financial data as its primary signal.** A green scoreboard is not the definition of success — a client who is exhausted and miserable with green metrics needs a different conversation than the dashboard suggests. The data is the launching point for a human conversation, not the destination.

Guiding philosophy: **Ordo ab Chao** — order from chaos.

Reports are produced monthly and delivered to the client as PDFs (rendered via WeasyPrint — HTML+CSS → PDF, locally). They're also viewable in-app.

---

## 2. The change I want to make

Today there is one report called **"Scoreboard"** — a red/yellow/green dashboard with 18 KPIs across Operations, P&L, and Cash Flow. It's information-dense, with columns for: Prior Year | YTD Actual | Full Year Forecast | Annual Target | vs Target | Grade. It also has a summary banner with Top Priorities / Also Needs Attention / Monitor.

I want to **split this into two distinct reports** sitting next to each other as tabs in the Reports section:

### Report 1 — "Report Card" (rename of current Scoreboard)
- **Same as today's Scoreboard.** No changes to layout, data, or grading logic.
- This is the data-rich, analytical lens. I love having all the columns and granularity for the working part of the meeting.
- Just renamed from "Scoreboard" → "Report Card."

### Report 2 — NEW "Scoreboard" (this is what we're designing)
- Same underlying data, **completely different visual treatment.**
- Goal: **communication over data.** Less busy. More visual cues. Color blocks. At-a-glance.
- Inspired by my **old spreadsheet** — which used color-block layouts, large cells, and visual weight to communicate health rather than precision.
- Think of it as the page I'd put on top of the binder. The Report Card is what's behind it for the deeper conversation.
- **Must be PDF-exportable** (HTML/CSS that renders cleanly via WeasyPrint).

> **Important — please ask me to share my old spreadsheet** before generating concepts. I'll send a screenshot of it. That's the aesthetic anchor; without seeing it you'll just be guessing.

---

## 3. The KPIs that need to live on both reports

All 18 metrics are graded Red / Yellow / Green against an annual Target (prorated by months elapsed for YTD).

**Operations:** Total Jobs, Avg Job Value, Revenue (computed)
**P&L:** COS, Gross Profit, Payroll, Marketing, Overhead, Net Op Profit, Other Income/Expense, Net Profit
**Cash Flow:** DSO, DIO, DPO, CF Asset Changes, CF Liability Changes, Net Cash Flow, Owner Draws

Plus a **summary** layer:
- Overall grade (rolled up)
- Up to 3 "Top Priority" red items the advisor (me) flagged
- Other reds = "Also Needs Attention"
- Yellows = "Monitor / Discuss"

The new Scoreboard doesn't have to show all 18 metrics with equal weight. Part of the design conversation is: **what do we surface front-and-center, what do we group, what do we de-emphasize?**

---

## 4. Design constraints (non-negotiable — these come from the broader product)

- **Light theme only.** The app uses warm cream/beige backgrounds (`#eae7e2` is the primary bg, `#e0ddd8` surface, borders around `#d4d0ca`). Text primary `#1a1918`, secondary `#5a5751`, muted `#9a9590`. Accent gold `#c8a96e`. **Do not introduce dark hex values** (`#1a1d22`, `#0e0f11`, etc.) — those were from a previous iteration and are forbidden now.
- **Color as signal.** Green / Yellow / Red is reserved for performance grades. Don't use those colors decoratively. Pick concrete hex values for grade colors that work both on screen and in PDF print.
- **Typography:** Sans-serif for prose. Monospace for numerical data. (I haven't picked specific fonts — open to suggestions.)
- **Whitespace generous, never cramped.**
- **Focused elegance.** Reference aesthetic: the calm, restrained, purposeful feel of the Claude desktop app. Reject anything that feels like "generic enterprise dashboard" or "Excel screenshot."
- **PDF render target:** WeasyPrint. So no JS-driven charts, no SVG animations — everything has to be HTML + CSS that renders to a static page. Tables, divs, CSS grid, basic SVG shapes are all fine.
- **One page if possible.** This report is meant to be the at-a-glance handout.

---

## 5. What I want out of the brainstorm session

**Produce 3–5 distinct concept directions** as actual rendered HTML files I can preview in a browser. Variety is the point — show me different ways of thinking about it, not five variations of one idea. Some directions to consider (not exhaustive, not prescriptive):

- Color-block grid (think: report card / scorecard from school)
- Big traffic-light tiles for the headline metrics + smaller summary blocks
- A "stoplight" header with a single overall grade + breakdowns underneath
- Heatmap style across categories
- Trend-arrow + grade hybrid
- Something that mimics my old spreadsheet aesthetic directly (after you've seen it)

For each concept, include:
- The rendered HTML (inline CSS is fine, or a single `<style>` block — make it self-contained)
- A 2–3 sentence description of the design philosophy behind it
- What it emphasizes / de-emphasizes vs. the others
- Any tradeoffs (e.g. "this looks great on screen but the colors will print muddy")

Use **realistic sample data** for Vetter Plumbing (a plumbing services company, ~$6M annual revenue, December fiscal year-end). Mix of green/yellow/red so I can see how each design handles a scoreboard with mixed health.

---

## 6. What to bring back to the implementation session

When I have a chosen direction (one concept, or a hybrid of two), I want a **summary handoff doc** I can paste back into my code-session Claude. It should contain:

1. **The chosen design** — the final HTML/CSS file (or a clear spec if it's a hybrid)
2. **Component breakdown** — what's in the header, body, footer; how rows/tiles/blocks are organized
3. **Data binding map** — which existing KPI maps to which visual element (e.g. "Net Profit grade → top-left tile, Revenue grade → top-right tile")
4. **Color palette decisions** — exact hex values for green/yellow/red (separate from the accent gold)
5. **PDF considerations** — anything that needs special handling for print (page breaks, color profiles)
6. **Anything explicitly rejected** — concepts I considered and dismissed, with the reason. Saves the implementation Claude from re-proposing them.

---

## 7. Things to NOT do in the brainstorm session

- Don't redesign the Report Card. It stays as-is.
- Don't change KPIs, grading thresholds, or the "max 3 Top Priorities" advisory rule. Those live in the engine.
- Don't propose adding the Scoreboard to other parts of the app. It's a Reports tab, full stop.
- Don't use dark theme colors.
- Don't introduce JS charting libraries (Chart.js, Recharts, etc.) — incompatible with the WeasyPrint PDF pipeline.
- Don't write any backend or React component code. **HTML/CSS mockups only.** The implementation session will translate the chosen design into a React component.
- Don't overthink the data model — assume all 18 KPIs and the summary layer are available in any shape we need them.

---

## 8. Quick-start for the brainstorm Claude

1. Acknowledge the brief and ask for the old-spreadsheet screenshot before producing anything.
2. Ask any clarifying questions about taste / preferences I haven't covered (e.g. "Do you want metric trend sparklines? Do you want absolute numbers visible or just the grade?").
3. Produce 3–5 concept directions as standalone HTML files.
4. We iterate until I pick a direction.
5. You write the handoff summary I'll paste back to my implementation session.
