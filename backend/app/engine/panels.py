"""The presentation as DATA: an ordered list of typed panels.

**The structural idea (Phase 7.2).** A presentation is not a document, it is a
list. Once that is the shape, generate / edit / reorder / present / export stop
being five features and become one small problem — and a card library later is
just "insert a panel of type X".

Seven types, two of them parameterized by a count. A small CLOSED set is what
makes the generator tractable; the shape came from a whiteboard the client-side
reviewer drew, whose circled "x3" on the action-plan panel is cardinality, drawn.

    action_review   once   what we committed to last time, and what moved
    highlights      once   two or three year-over-year callouts
    health_bar      once   one stacked green/yellow/red bar — the whole scoreboard
    exception       xN     one metric that needs a conversation
    three_column    once   YTD actual / full-year forecast / EOY target
    objective       x3     one goal, its owner and its date
    close           once   the question to leave them with

**Bound vs authored.** Every panel starts `bound`: its prose is generated and it
regenerates freely. The moment the advisor edits that prose the panel flips to
`authored` and is never regenerated again — but it keeps a fingerprint of the
figures it was written against, so a later regeneration can say "the numbers under
this changed" instead of silently contradicting it. Presence of an edit is the
switch; nothing has to be declared up front.

This module is PURE — no DB, no FastAPI. It takes already-fetched data and returns
panels, so the whole generator is testable without a database.
"""
from __future__ import annotations

import hashlib
import json

PANEL_TYPES = (
    "action_review", "highlights", "health_bar",
    "exception", "three_column", "objective", "close",
)

# The whiteboard's ordering: where we were → where we are → where we're going → what next.
DEFAULT_SEQUENCE = (
    "action_review", "highlights", "health_bar",
    "exception", "three_column", "objective", "close",
)

MAX_OBJECTIVE_PANELS = 3

# Metrics whose movement makes a good year-over-year headline, most quotable first.
_HIGHLIGHT_PREFERENCE = (
    "net_cash_flow", "net_profit", "gross_profit", "revenue",
    "blended_avg_job_value", "total_jobs", "dso_days",
)
MAX_HIGHLIGHTS = 3


def fingerprint(data: dict) -> str:
    """A stable hash of a panel's bound figures.

    Stored when a panel is authored, so a later regeneration can tell the advisor
    the numbers under their words have moved — the alternative is a presentation
    that quietly contradicts itself.
    """
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]


def _panel(pid: str, ptype: str, title: str, body: str, data: dict, source: str) -> dict:
    return {
        "id": pid,
        "type": ptype,
        "mode": "bound",          # flips to "authored" on first prose edit
        "title": title,
        "body": body,
        "data": data,
        "source": source,         # where the figures came from (Module 3a)
        "data_fingerprint": fingerprint(data),
    }


# ── money / wording helpers ─────────────────────────────────────────────────

def money(cents, *, signed: bool = False) -> str:
    if cents is None:
        return "—"
    d = cents / 100
    sign = "-" if d < 0 else ("+" if signed and d > 0 else "")
    a = abs(d)
    if a >= 1_000_000:
        return f"{sign}${a / 1_000_000:.2f}M"
    return f"{sign}${a:,.0f}"


def value_str(v, type_) -> str:
    if v is None:
        return "—"
    if type_ == "cents":
        return money(v)
    if type_ == "days":
        return f"{round(v)} days"
    return f"{round(v):,}"


def _pct_change(now, before):
    """Percent change, or None when there is nothing honest to compare against."""
    if now is None or before is None or before == 0:
        return None
    return (now - before) / abs(before) * 100


def direction_word(pct, higher_is_better) -> str:
    if pct is None:
        return "flat"
    improving = pct > 0 if higher_is_better else pct < 0
    return "improving" if improving else "slipping"


# ── the panels ──────────────────────────────────────────────────────────────

def _action_review(prior_steps: list[dict]) -> dict:
    """What we said last time, and what happened.

    The panel the whole deliverable opens with, and the reason a presented
    presentation has to freeze: this reads from the last one.
    """
    done = [s for s in prior_steps if s.get("completed_at")]
    open_ = [s for s in prior_steps if not s.get("completed_at")]

    if not prior_steps:
        body = ("This is the first review, so there is nothing to check off yet. "
                "From next month this panel opens with what we committed to.")
    elif not open_:
        body = f"All {len(done)} of them are done."
    elif not done:
        body = f"None of the {len(open_)} are done yet — worth asking what got in the way."
    else:
        body = (f"{len(done)} of {len(prior_steps)} done. "
                "The ones that moved are the ones that got done — that is the method.")

    return _panel(
        "action-review", "action_review", "Since we last met", body,
        {
            "total": len(prior_steps),
            "completed": len(done),
            "steps": [
                {"text": s.get("text", ""), "owners": s.get("owners") or [],
                 "due_date": s.get("due_date"), "done": bool(s.get("completed_at"))}
                for s in prior_steps
            ],
        },
        "action_plan_steps.completed_at",
    )


def _highlights(metrics: list[dict]) -> dict:
    """Two or three year-over-year callouts, chosen for quotability."""
    by_key = {m["key"]: m for m in metrics}
    picks = []
    for key in _HIGHLIGHT_PREFERENCE:
        m = by_key.get(key)
        if not m:
            continue
        pct = _pct_change(m.get("ytd_actual"), m.get("prior_year_total"))
        if pct is None or abs(pct) < 1:
            continue                      # "unchanged" is not a highlight
        picks.append({
            "label": m["label"],
            "value": value_str(m.get("ytd_actual"), m.get("type")),
            "change_pct": round(pct, 1),
            "direction": direction_word(pct, m.get("higher_is_better", True)),
        })
        if len(picks) == MAX_HIGHLIGHTS:
            break

    body = ("Nothing has moved far enough from last year to call out yet."
            if not picks else
            "Compared with the same stretch of last year.")
    return _panel("highlights", "highlights", "Year over year", body,
                  {"items": picks}, "actuals vs prior year")


def _health_bar(counts: dict, overall: str | None) -> dict:
    """The whole scoreboard as one bar. No green metric is ever shown alone."""
    total = counts["green"] + counts["yellow"] + counts["red"]
    pct = ({k: round(counts[k] / total * 100) for k in ("green", "yellow", "red")}
           if total else {"green": 0, "yellow": 0, "red": 0})

    if not total:
        body = "No targets set yet, so nothing is graded."
    elif counts["red"] == 0 and counts["yellow"] == 0:
        body = "Everything we track is on plan."
    elif counts["red"] == 0:
        body = f"Nothing is off plan. {counts['yellow']} worth keeping an eye on."
    else:
        s = "" if counts["red"] == 1 else "s"
        body = (f"{counts['red']} thing{s} off plan out of {total} we track. "
                "Those are the ones worth the hour.")

    return _panel("health-bar", "health_bar", "Where we are", body,
                  {"counts": counts, "percent": pct, "total": total,
                   "overall_grade": overall},
                  "scoreboard grades")


def _exception(m: dict, index: int) -> dict:
    """One metric that needs a conversation.

    Carries grade AND direction, and lets them disagree — "behind but moving" is a
    completely different conversation from "behind and stuck", and a grade alone
    cannot tell them apart.
    """
    pct = _pct_change(m.get("ytd_actual"), m.get("prior_year_total"))
    direction = direction_word(pct, m.get("higher_is_better", True))
    body = m.get("priority_reason") or (
        f"{value_str(m.get('ytd_actual'), m.get('type'))} against a target of "
        f"{value_str(m.get('prorated_target'), m.get('type'))}."
    )
    if pct is not None:
        body += (f" {'Moving the right way' if direction == 'improving' else 'Still moving the wrong way'} "
                 f"versus last year ({pct:+.1f}%).")

    return _panel(
        f"exception-{m['key']}", "exception", m["label"], body,
        {
            "metric_key": m["key"],
            "grade": m.get("grade"),
            "direction": direction,
            "change_vs_prior_pct": None if pct is None else round(pct, 1),
            "ytd_actual": m.get("ytd_actual"),
            "prorated_target": m.get("prorated_target"),
            "annual_target": m.get("annual_target"),
            "prior_year_total": m.get("prior_year_total"),
            "type": m.get("type"),
            "higher_is_better": m.get("higher_is_better", True),
            "action_item": m.get("action_item"),
            "rank": index + 1,
        },
        f"scoreboard metric {m['key']}",
    )


def _three_column(metrics: list[dict], keys: tuple) -> dict:
    """YTD actual → FULL-YEAR forecast → EOY target.

    The middle column is the full year, not year-to-date. Comparing a YTD actual
    with a YTD forecast is nearly tautological for closed months; the useful
    reading is "here is what we have done, here is where we land, here is where we
    said we would land". (Confirmed with the client-side reviewer 2026-09-17.)
    """
    by_key = {m["key"]: m for m in metrics}
    rows = []
    for key in keys:
        m = by_key.get(key)
        if not m:
            continue
        rows.append({
            "label": m["label"],
            "type": m.get("type"),
            "ytd_actual": m.get("ytd_actual"),
            "full_year_forecast": m.get("full_year_forecast"),
            "annual_target": m.get("annual_target"),
            "grade": m.get("grade"),
        })
    return _panel("three-column", "three_column", "Where we're going",
                  "Year to date, where the year lands, and where we said it would.",
                  {"rows": rows, "columns": ["YTD actual", "Full-year forecast", "EOY target"]},
                  "targets model")


def _objective(obj: dict, index: int) -> dict:
    steps = obj.get("steps") or []
    return _panel(
        f"objective-{obj.get('id', index)}", "objective",
        obj.get("objective") or f"Objective {index + 1}",
        obj.get("current_results") or "",
        {
            "rank": index + 1,
            "steps": [
                {"text": s.get("text", ""), "owners": s.get("owners") or [],
                 "due_date": s.get("due_date")}
                for s in steps
            ],
        },
        "action_plan_items",
    )


def _close(question: str | None) -> dict:
    return _panel(
        "close", "close", "One question for next month",
        question or ("The numbers are the easy part. What would change for you if "
                     "the next three months went the way this plan says?"),
        {}, "—",
    )


# ── the generator ───────────────────────────────────────────────────────────

def build_panels(
    scoreboard: dict,
    objectives: list[dict],
    prior_steps: list[dict],
    *,
    exception_keys: list[str] | None = None,
    three_column_keys: tuple = ("revenue", "net_profit", "net_cash_flow"),
) -> list[dict]:
    """The default panel sequence, filled from data that already exists.

    `exception_keys` lets the caller decide which metrics earn a panel. Left None,
    the rule is **every red** — yellows are opt-in, and the flag that opts them in
    arrives with the control that sets it.
    """
    metrics = [m for sec in scoreboard.get("sections", []) for m in sec.get("metrics", [])]

    if exception_keys is None:
        chosen = [m for m in metrics if m.get("grade") == "red"]
    else:
        wanted = list(exception_keys)
        by_key = {m["key"]: m for m in metrics}
        chosen = [by_key[k] for k in wanted if k in by_key]

    # Top priorities first — the advisor's ordering beats the metric list's.
    chosen.sort(key=lambda m: (not m.get("is_top_priority"), m.get("variance_pct") or 0))

    counts = {
        "green": scoreboard.get("green_count", 0),
        "yellow": scoreboard.get("yellow_count", 0),
        "red": scoreboard.get("red_count", 0),
    }

    panels = [
        _action_review(prior_steps),
        _highlights(metrics),
        _health_bar(counts, scoreboard.get("overall_grade")),
    ]
    panels += [_exception(m, i) for i, m in enumerate(chosen)]
    panels.append(_three_column(metrics, three_column_keys))
    panels += [_objective(o, i) for i, o in enumerate(objectives[:MAX_OBJECTIVE_PANELS])]
    panels.append(_close(None))
    return panels


def merge_authored(new_panels: list[dict], existing: list[dict]) -> list[dict]:
    """Regenerate without trampling the advisor's words.

    A panel the advisor has edited (`mode == "authored"`) keeps its title and body.
    Its figures are refreshed regardless — stale numbers under live prose is the
    one outcome worse than either — and `figures_changed` is raised when those
    figures no longer match what the words were written against.
    """
    prior = {p["id"]: p for p in existing}
    out = []
    for panel in new_panels:
        old = prior.get(panel["id"])
        if old and old.get("mode") == "authored":
            panel = {
                **panel,
                "mode": "authored",
                "title": old.get("title", panel["title"]),
                "body": old.get("body", panel["body"]),
                "data_fingerprint": old.get("data_fingerprint"),
                "figures_changed": old.get("data_fingerprint") != fingerprint(panel["data"]),
            }
        out.append(panel)
    return out
