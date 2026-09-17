"""The presentation generator, and the rule that protects the advisor's words.

Two things have to hold:

  * the default sequence comes out in the whiteboard's order, with the repeats
    (exception xN, objective x3) parameterized by count rather than hardcoded;
  * regenerating never tramples prose the advisor wrote, never leaves stale
    figures under live prose, and says so when the two disagree.

The engine is pure, so this needs no database.

    cd backend && python scripts/verify_panels.py
"""
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from app.engine.panels import (  # noqa: E402
    build_panels, merge_authored, fingerprint, MAX_OBJECTIVE_PANELS,
)

FAILED = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f"  [{detail}]" if detail and not cond else ""))
    if not cond:
        FAILED.append(name)


def metric(key, label, grade, *, ytd, prior, target, type_="cents",
           higher=True, priority=False):
    return {
        "key": key, "label": label, "type": type_, "higher_is_better": higher,
        "prior_year_total": prior, "ytd_actual": ytd, "full_year_forecast": int(ytd * 1.4),
        "annual_target": target, "prorated_target": int(target * 0.66) if target else None,
        "variance_pct": -12.0 if grade == "red" else 3.0, "variance_abs": None,
        "grade": grade, "grade_is_override": False, "is_top_priority": priority,
        "notes": None, "has_target": target is not None,
        "priority_reason": None, "action_item": None,
    }


SCOREBOARD = {
    "fiscal_year": 2026, "months_elapsed": 8, "overall_grade": "yellow",
    "green_count": 11, "yellow_count": 5, "red_count": 2,
    "sections": [{"name": "P&L", "metrics": [
        metric("revenue", "Revenue", "green", ytd=55_430_000, prior=49_000_000, target=84_000_000),
        metric("net_profit", "Net Profit", "red", ytd=5_439_500, prior=6_100_000, target=11_100_000),
        metric("gross_profit", "Gross Profit", "green", ytd=36_029_500, prior=31_000_000, target=55_000_000),
        metric("overhead_expenses", "Overhead", "red", ytd=9_650_000, prior=8_100_000,
               target=13_200_000, higher=False, priority=True),
        metric("net_cash_flow", "Net Cash Flow", "yellow", ytd=2_100_000, prior=1_980_000, target=4_000_000),
        metric("dso_days", "DSO (Days)", "yellow", ytd=48, prior=53, target=35,
               type_="days", higher=False),
    ]}],
}

OBJECTIVES = [
    {"id": 1, "objective": "Get paid faster", "current_results": "48 days, was 53",
     "steps": [{"text": "Deposit on jobs over $2,500", "owners": ["Doug"],
                "due_date": "2026-10-01", "completed_at": None}]},
    {"id": 2, "objective": "Hold overhead at plan", "current_results": "",
     "steps": [{"text": "Cancel unused subscriptions", "owners": ["Chad"],
                "due_date": "2026-09-19", "completed_at": None}]},
    {"id": 3, "objective": "Re-price material escalator", "current_results": "", "steps": []},
    {"id": 4, "objective": "A fourth thing", "current_results": "", "steps": []},
]

PRIOR_STEPS = [
    {"text": "Call the nine accounts past 60 days", "owners": ["Marisol"],
     "due_date": "2026-08-22", "completed_at": "2026-08-20T12:00:00Z"},
    {"text": "Stop quoting off the spring price list", "owners": ["Doug"],
     "due_date": "2026-08-18", "completed_at": "2026-08-17T12:00:00Z"},
    {"text": "Cancel unused subscriptions", "owners": ["Chad"],
     "due_date": "2026-08-25", "completed_at": None},
]

panels = build_panels(SCOREBOARD, OBJECTIVES, PRIOR_STEPS)
types = [p["type"] for p in panels]
by_type = {}
for p in panels:
    by_type.setdefault(p["type"], []).append(p)

print("The default sequence is the whiteboard's arc:")
check("opens with what we committed to last time", types[0] == "action_review", types[0])
check("then year-over-year highlights", types[1] == "highlights", types[1])
check("then the one health bar", types[2] == "health_bar", types[2])
check("exceptions come before where-we're-going",
      types.index("exception") < types.index("three_column"))
check("objectives come after it",
      types.index("objective") > types.index("three_column"))
check("closes on the question", types[-1] == "close", types[-1])

print()
print("Repeats are driven by the data, not hardcoded:")
check("one exception panel per RED metric (2 reds)", len(by_type["exception"]) == 2,
      len(by_type["exception"]))
check("no green or yellow metric gets a panel of its own",
      all(p["data"]["grade"] == "red" for p in by_type["exception"]))
check("the advisor's top priority is ranked first",
      by_type["exception"][0]["data"]["metric_key"] == "overhead_expenses",
      by_type["exception"][0]["data"]["metric_key"])
check(f"objectives are capped at {MAX_OBJECTIVE_PANELS} even though 4 exist",
      len(by_type["objective"]) == MAX_OBJECTIVE_PANELS, len(by_type["objective"]))

print()
print("Yellows are opt-in, and opting one in works:")
opted = build_panels(SCOREBOARD, OBJECTIVES, PRIOR_STEPS,
                     exception_keys=["net_profit", "dso_days"])
keys = [p["data"]["metric_key"] for p in opted if p["type"] == "exception"]
check("a flagged yellow earns a panel", "dso_days" in keys, keys)
check("and an unflagged red is then left out", "overhead_expenses" not in keys, keys)

print()
print("Grade and direction are allowed to disagree:")
dso = next(p for p in opted if p["type"] == "exception" and p["data"]["metric_key"] == "dso_days")
check("DSO is graded yellow", dso["data"]["grade"] == "yellow", dso["data"]["grade"])
check("but reads as improving — 48 days, down from 53",
      dso["data"]["direction"] == "improving", dso["data"]["direction"])
check("the prose says so", "right way" in dso["body"], dso["body"])

print()
print("The action review reads last month's commitments:")
ar = by_type["action_review"][0]
check("counts 2 of 3 done", ar["data"]["completed"] == 2 and ar["data"]["total"] == 3,
      f'{ar["data"]["completed"]}/{ar["data"]["total"]}')
check("names the method", "the ones that got done" in ar["body"], ar["body"])

first = build_panels(SCOREBOARD, OBJECTIVES, [])
check("with no prior meeting it says so, rather than showing an empty list",
      "first review" in first[0]["body"], first[0]["body"])

print()
print("The middle column of three_column is the FULL YEAR, not YTD:")
tc = by_type["three_column"][0]
check("columns are YTD actual / full-year forecast / EOY target",
      tc["data"]["columns"] == ["YTD actual", "Full-year forecast", "EOY target"],
      tc["data"]["columns"])
rev = next(r for r in tc["data"]["rows"] if r["label"] == "Revenue")
check("and the forecast is the full-year figure, not the YTD one",
      rev["full_year_forecast"] > rev["ytd_actual"],
      f'{rev["full_year_forecast"]} vs {rev["ytd_actual"]}')

print()
print("Regenerating does not trample the advisor's words:")
edited = [dict(p) for p in panels]
hb = next(p for p in edited if p["type"] == "health_bar")
hb["mode"] = "authored"
hb["body"] = "Doug — two things off plan, and they are the same two as last month."
hb["data_fingerprint"] = fingerprint(hb["data"])

again = merge_authored(build_panels(SCOREBOARD, OBJECTIVES, PRIOR_STEPS), edited)
hb2 = next(p for p in again if p["type"] == "health_bar")
check("an authored panel keeps its prose", hb2["body"] == hb["body"], hb2["body"])
check("and stays authored", hb2["mode"] == "authored", hb2["mode"])
check("figures did not change, so nothing is flagged",
      hb2.get("figures_changed") is False, hb2.get("figures_changed"))

bound = next(p for p in again if p["type"] == "highlights")
check("a panel nobody edited regenerates freely", bound["mode"] == "bound", bound["mode"])

print()
print("If the numbers move under authored prose, it is flagged, not hidden:")
moved = {**SCOREBOARD, "red_count": 4, "green_count": 9}
after = merge_authored(build_panels(moved, OBJECTIVES, PRIOR_STEPS), edited)
hb3 = next(p for p in after if p["type"] == "health_bar")
check("the prose still stands", hb3["body"] == hb["body"])
check("the figures underneath are refreshed", hb3["data"]["counts"]["red"] == 4,
      hb3["data"]["counts"]["red"])
check("and the disagreement is raised", hb3.get("figures_changed") is True,
      hb3.get("figures_changed"))

print()
print("Every panel is traceable and identified:")
check("all panels carry a source", all(p.get("source") for p in panels))
check("all ids are unique", len({p["id"] for p in panels}) == len(panels))
check("every type is a known type",
      all(p["type"] in ("action_review", "highlights", "health_bar", "exception",
                        "three_column", "objective", "close") for p in panels))

print()
if FAILED:
    print(f"{len(FAILED)} CHECK(S) FAILED: " + ", ".join(FAILED))
    sys.exit(1)
print("ALL PASS")
