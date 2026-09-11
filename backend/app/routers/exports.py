"""
Phase 5 export endpoints.

JSON export: GET /api/clients/{client_id}/export/json/{year}
PDF exports: GET /api/clients/{client_id}/export/pdf/{type}/{year}
  type: scoreboard | forecast | action-plan

PDF requires WeasyPrint + system libs (Cairo/Pango).
Install on Mac: brew install cairo pango && pip install weasyprint
If WeasyPrint is not installed the PDF endpoints return HTTP 503.
"""
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.action_plan import ActionPlanItem
from app.models.client import Client
from app.models.forecast_period import ForecastPeriod
from app.models.monthly_actuals import MonthlyActuals
from app.models.targets import ClientTarget, ScoreboardEntry

router = APIRouter(prefix="/api/clients", tags=["exports"])

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_jinja = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)

# ---------------------------------------------------------------------------
# JSON Export
# ---------------------------------------------------------------------------

@router.get("/{client_id}/export/json/{year}")
def export_json(client_id: int, year: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Forecast periods for the year
    periods = (
        db.query(ForecastPeriod)
        .filter(ForecastPeriod.client_id == client_id, ForecastPeriod.fiscal_year == year)
        .order_by(ForecastPeriod.month)
        .all()
    )

    # Targets
    targets = (
        db.query(ClientTarget)
        .filter(ClientTarget.client_id == client_id, ClientTarget.fiscal_year == year)
        .all()
    )

    # Scoreboard entries (grades)
    grades = {
        g.metric_key: g
        for g in db.query(ScoreboardEntry).filter(
            ScoreboardEntry.client_id == client_id,
            ScoreboardEntry.fiscal_year == year,
        ).all()
    }

    # Action plan items (notes excluded — advisor-only)
    action_items = (
        db.query(ActionPlanItem)
        .filter(ActionPlanItem.client_id == client_id, ActionPlanItem.fiscal_year == year)
        .order_by(ActionPlanItem.sort_order, ActionPlanItem.id)
        .all()
    )

    forecast_months = []
    for p in periods:
        forecast_months.append({
            "period": f"{year}-{p.month:02d}",
            "revenue": p.revenue or 0,
            "cost_of_sales": p.cost_of_sales or 0,
            "gross_profit": p.gross_profit or 0,
            "payroll_expenses": p.payroll_expenses or 0,
            "marketing_expenses": p.marketing_expenses or 0,
            "overhead_expenses": p.overhead_expenses or 0,
            "net_operating_profit": p.net_operating_profit or 0,
            "other_income_expense": p.other_income_expense or 0,
            "net_profit": p.net_profit or 0,
            "net_cash_flow": p.net_cash_flow or 0,
            "actuals": p.source_type == "actual",
        })

    target_list = []
    for t in targets:
        g = grades.get(t.metric_key)
        target_list.append({
            "metric_key": t.metric_key,
            "target_value": t.target_value,
            "target_type": t.target_type,
            "grade": g.grade if g else None,
            "grade_is_override": g.grade_is_override if g else False,
        })

    # 1.1: objectives carry nested action items (steps). `next_steps`, `owner`
    # and `due_date` stay on the objective as a flattened summary of its steps
    # so a 1.0 reader still gets something sensible.
    action_plan_items = []
    for item in action_items:
        steps = [
            {
                "id": f"ap-{item.id:03d}-{s.id:03d}",
                "text": s.text,
                "owners": list(s.owners or []),
                "due_date": s.due_date.isoformat() if s.due_date else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in item.steps
        ]
        owners = []
        for s in item.steps:
            for o in (s.owners or []):
                if o not in owners:
                    owners.append(o)
        due_dates = [s.due_date for s in item.steps if s.due_date]
        action_plan_items.append({
            "id": f"ap-{item.id:03d}",
            "objective": item.objective,
            "current_results": item.current_results,
            "next_steps": "; ".join(s.text for s in item.steps if s.text) or None,
            "owner": ", ".join(owners) or None,
            "due_date": max(due_dates).isoformat() if due_dates else None,
            "steps": steps,
            # notes intentionally excluded — advisor-only
        })

    payload = {
        "ordobook_version": "1.1.0",  # 1.1: action_plan items gained steps[] (additive)
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "client": {
            "id": str(client.id),
            "name": client.name,
            "fiscal_year_start": "january",
            "industry": client.industry or None,
        },
        "period": {
            "year": year,
            "label": str(year),
        },
        "forecast_12mo": {
            "months": forecast_months,
        },
        "targets": {
            "fiscal_year": year,
            "items": target_list,
        },
        "action_plan": {
            "fiscal_year": year,
            "items": action_plan_items,
        },
        "metadata": {
            "generated_by": "ORDOBOOK Desktop v0.1",
            "advisor_notes": None,
        },
    }

    filename = f"{client.id}_{year}_export.json"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# PDF Export (requires WeasyPrint)
# ---------------------------------------------------------------------------

def _get_weasyprint():
    try:
        from weasyprint import HTML, CSS
        return HTML, CSS
    except ImportError:
        return None, None


# --- Scoreboard PDF: Concept 5 — "The Sketch" --------------------------------

_HERO_KEYS = ("revenue", "net_profit", "net_cash_flow")
_HERO_LABEL = {"revenue": "Revenue", "net_profit": "Net Profit", "net_cash_flow": "Net Cash Flow"}
_HERO_ABBR = {"revenue": "R", "net_profit": "NP", "net_cash_flow": "NCF"}

_DOT_COLOR = {"green": "var(--green)", "yellow": "var(--yellow)", "red": "var(--red)"}

_ACTIONS_BY_KEY = {
    "dso_days": "Call top 5 AR accounts",
    "dio_days": "Review inventory turn",
    "dpo_days": "Review supplier payment terms",
    "payroll_expenses": "Review hiring pace",
    "marketing_expenses": "Audit marketing ROI",
    "overhead_expenses": "Audit overhead line items",
    "cost_of_sales": "Review COS drivers + margin",
    "owner_total_draws": "Set draw cap for remaining quarters",
    "cf_assets_change": "Working capital review",
    "cf_liabilities_change": "AP terms review",
    "net_cash_flow": "Cash conversion deep-dive",
    "net_profit": "P&L review vs plan",
    "net_operating_profit": "Operating margin review",
    "gross_profit": "Pricing + COS review",
    "revenue": "Revenue funnel review",
    "total_jobs": "Job pipeline review",
    "blended_avg_job_value": "Pricing review",
}

_MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _fmt_money(value):
    if value is None:
        return "—"
    abs_v = abs(value)
    sign = "−" if value < 0 else ""
    if abs_v >= 1_000_000:
        return f"{sign}${abs_v / 1_000_000:.1f}M"
    if abs_v >= 1_000:
        return f"{sign}${round(abs_v / 1_000)}K"
    return f"{sign}${round(abs_v)}"


def _fmt_value(value, type_):
    if value is None:
        return "—"
    if type_ == "money":
        return _fmt_money(value)
    if type_ == "days":
        return f"{round(value)}d"
    return f"{round(value):,}"


def _fmt_var(pct):
    if pct is None:
        return "—"
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct:.1f}%"


def _auto_headline(red, yellow, green):
    if red >= 3:
        return "Multiple priorities need attention this period."
    if red >= 1:
        s = "" if red == 1 else "s"
        return f"{red} item{s} in the red — let's talk through the path forward."
    if yellow > green:
        return "Mixed signals — several items to monitor."
    if green > 0:
        return "Performance on track — stay the course."
    return "Set targets and import actuals to begin grading."


def _auto_reason(metric_dollars, label, type_, var_pct, notes):
    if notes:
        return notes
    if var_pct is None:
        return f"Currently {_fmt_value(metric_dollars['ytd'], type_)} — no target set"
    direction = "ahead of" if var_pct >= 0 else "behind"
    ytd_str = _fmt_value(metric_dollars["ytd"], type_)
    target_str = _fmt_value(metric_dollars["target"], type_)
    return f"{ytd_str} vs {target_str} target — {_fmt_var(var_pct)} {direction} plan"


def _build_scoreboard_template_data(client: Client, year: int, raw: dict) -> dict:
    """Adapter: backend ScoreboardResponse dict → Concept 5 template data."""
    sections_in = raw.get("sections", [])

    def remap(m):
        is_cents = m["type"] == "cents"
        conv = lambda v: None if v is None else (v / 100 if is_cents else v)
        return {
            "key": m["key"],
            "label": m["label"],
            "grade": m["grade"] or "yellow",
            "grade_short": (m["grade"] or "y")[0],
            "ytd": conv(m["ytd_actual"]),
            "target": conv(m["annual_target"]),
            "prior": conv(m["prior_year_total"]),
            "var_pct": m["variance_pct"],
            "type": "money" if is_cents else m["type"],
            "notes": m.get("notes"),
            "priority_reason": m.get("priority_reason"),
            "action_item": m.get("action_item"),
            "is_top_priority": m["is_top_priority"],
            "value": _fmt_value(conv(m["ytd_actual"]), "money" if is_cents else m["type"]),
            "var": _fmt_var(m["variance_pct"]),
        }

    sections = []
    all_metrics = []
    for sec in sections_in:
        metrics = [remap(m) for m in sec["metrics"]]
        rank = {"green": 0, "yellow": 1, "red": 2}
        sections.append({
            "name": sec["name"],
            "metrics_sorted": sorted(metrics, key=lambda m: rank.get(m["grade"], 1)),
        })
        all_metrics.extend(metrics)

    # Heroes
    heroes = []
    for k in _HERO_KEYS:
        m = next((x for x in all_metrics if x["key"] == k), None)
        if not m:
            continue
        heroes.append({
            "abbr": _HERO_ABBR[k],
            "name": _HERO_LABEL[k],
            "value": _fmt_money(m["ytd"]),
            "target": _fmt_money(m["target"]),
            "var": _fmt_var(m["var_pct"]),
            "dot_color": _DOT_COLOR.get(m["grade"], "var(--ink-3)"),
        })

    # Priorities (max 3)
    priorities = []
    for m in all_metrics:
        if not m["is_top_priority"]:
            continue
        priorities.append({
            "key": m["key"],
            "label": m["label"],
            # Advisor wording wins; the auto text is the placeholder until it's written.
            "reason": m["priority_reason"] or _auto_reason(m, m["label"], m["type"], m["var_pct"], m["notes"]),
            "action": m["action_item"] or _ACTIONS_BY_KEY.get(m["key"], m["label"]),
        })
        if len(priorities) >= 3:
            break

    # Strip ordering: green → yellow → red
    rank = {"green": 0, "yellow": 1, "red": 2}
    strip = sorted(all_metrics, key=lambda m: rank.get(m["grade"], 1))
    strip = [{"label": m["label"], "grade_short": m["grade_short"]} for m in strip]

    counts = {
        "green": raw.get("green_count", 0),
        "yellow": raw.get("yellow_count", 0),
        "red": raw.get("red_count", 0),
    }
    months_elapsed = raw.get("months_elapsed") or 1
    month_idx = max(0, min(11, months_elapsed - 1))
    today = datetime.now(timezone.utc)

    return {
        "client": client.name,
        "period": f"YTD through {_MONTH_NAMES[month_idx]} {year}",
        "prepared_by": "ORDOBOOK · Reviewed by advisor",
        "prepared_date": today.strftime("%B %-d, %Y"),
        "overall": {
            "grade": raw.get("overall_grade"),
            "headline": raw.get("headline") or _auto_headline(counts["red"], counts["yellow"], counts["green"]),
            "counts": counts,
        },
        "heroes": heroes,
        "priorities": priorities,
        "sections": sections,
        "strip": strip,
    }


def _render_scoreboard_html(client: Client, year: int, db: Session) -> str:
    from app.routers.targets import get_scoreboard

    raw = get_scoreboard(client.id, year, db)
    raw_dict = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
    template_data = _build_scoreboard_template_data(client, year, raw_dict)

    template = _jinja.get_template("scoreboard.html.j2")
    return template.render(data=template_data)


def _action_plan_html(client: Client, year: int, items) -> str:
    rows_html = ""
    for i, item in enumerate(items, 1):
        # Objective row, then one indented row per action item.
        rows_html += f"""
        <tr class="objective">
          <td class="num" style="color:#888">{i}</td>
          <td colspan="2"><strong>{item.objective or "—"}</strong></td>
          <td colspan="3">{item.current_results or "—"}</td>
        </tr>"""
        if not item.steps:
            rows_html += """
        <tr class="step"><td></td><td colspan="5" style="color:#aaa">No action items</td></tr>"""
        for j, s in enumerate(item.steps, 1):
            due = s.due_date.strftime("%b %d, %Y") if s.due_date else "—"
            owners = ", ".join(s.owners or []) or "—"
            rows_html += f"""
        <tr class="step">
          <td class="num" style="color:#bbb">{i}.{j}</td>
          <td colspan="3" style="padding-left:18px">{s.text or "—"}</td>
          <td>{owners}</td>
          <td>{due}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body {{ font-family: system-ui, sans-serif; font-size: 11px; color: #1a1918; margin: 40px; }}
  h1 {{ font-size: 20px; margin-bottom: 4px; }}
  .sub {{ color: #888; margin-bottom: 24px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .08em;
        color: #888; padding: 6px 8px; border-bottom: 2px solid #ddd; }}
  td {{ padding: 8px 8px; border-bottom: 1px solid #eee; vertical-align: top; }}
  .num {{ text-align: right; width: 34px; white-space: nowrap; }}
  tr.objective td {{ background: #f7f5f2; border-top: 2px solid #e3dfd8; }}
  tr.step td {{ font-size: 10.5px; }}
</style>
</head><body>
  <h1>Action Plan — {year}</h1>
  <div class="sub">{client.name}</div>
  <table>
    <thead><tr>
      <th>#</th><th colspan="2">Objective / Action Items</th>
      <th>Current Results</th><th>Owner</th><th>Due Date</th>
    </tr></thead>
    <tbody>{rows_html or '<tr><td colspan="6" style="color:#aaa;text-align:center;padding:20px">No action plan items</td></tr>'}</tbody>
  </table>
  <p style="margin-top:24px;font-size:9px;color:#aaa">
    Generated by ORDOBOOK · {datetime.now(timezone.utc).strftime('%Y-%m-%d')}
  </p>
</body></html>"""


@router.get("/{client_id}/export/pdf/{export_type}/{year}")
def export_pdf(client_id: int, export_type: str, year: int, db: Session = Depends(get_db)):
    HTML, CSS = _get_weasyprint()
    if HTML is None:
        raise HTTPException(
            status_code=503,
            detail="PDF export requires WeasyPrint. Install: brew install cairo pango && pip install weasyprint",
        )

    if export_type not in ("scoreboard", "action-plan"):
        raise HTTPException(status_code=400, detail="export_type must be scoreboard or action-plan")

    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if export_type == "scoreboard":
        html_content = _render_scoreboard_html(client, year, db)
        css_path = TEMPLATES_DIR / "scoreboard.css"
        pdf_bytes = HTML(
            string=html_content,
            base_url=str(TEMPLATES_DIR),
        ).write_pdf(stylesheets=[CSS(filename=str(css_path))])
    else:  # action-plan
        items = (
            db.query(ActionPlanItem)
            .filter(ActionPlanItem.client_id == client_id, ActionPlanItem.fiscal_year == year)
            .order_by(ActionPlanItem.sort_order, ActionPlanItem.id)
            .all()
        )
        html_content = _action_plan_html(client, year, items)
        pdf_bytes = HTML(string=html_content).write_pdf()

    filename = f"{client_id}_{year}_{export_type}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
