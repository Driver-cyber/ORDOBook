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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.action_plan import ActionPlanItem
from app.models.client import Client
from app.models.forecast_period import ForecastPeriod
from app.models.monthly_actuals import MonthlyActuals
from app.models.targets import ClientTarget, ScoreboardEntry

router = APIRouter(prefix="/api/clients", tags=["exports"])

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

    action_plan_items = [
        {
            "id": f"ap-{item.id:03d}",
            "objective": item.objective,
            "current_results": item.current_results,
            "next_steps": item.next_steps,
            "owner": item.owner,
            "due_date": item.due_date.isoformat() if item.due_date else None,
            # notes intentionally excluded — advisor-only
        }
        for item in action_items
    ]

    payload = {
        "ordobook_version": "1.0.0",
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


def _scoreboard_html(client: Client, year: int, periods, targets, grades) -> str:
    from app.routers.targets import SCOREBOARD_METRICS, _aggregate, _compute_grade, _variance_pct

    actual_periods = [p for p in periods if p.source_type == "actual"]
    months_elapsed = len(actual_periods)
    targets_map = {t.metric_key: t for t in targets}

    rows_html = ""
    for metric in SCOREBOARD_METRICS:
        key = metric["key"]
        ytd = _aggregate(actual_periods, metric)
        full = _aggregate(periods, metric)
        t_obj = targets_map.get(key)
        annual_target = t_obj.target_value if t_obj else None
        g_obj = grades.get(key)
        grade = g_obj.grade if g_obj and g_obj.grade_is_override else None
        if not grade and annual_target and months_elapsed > 0:
            prorated = int(annual_target * months_elapsed / 12)
            grade = _compute_grade(ytd, prorated, metric["higher_is_better"]) if prorated else None

        grade_color = {"green": "#2d9e52", "yellow": "#d4a017", "red": "#d43f3f"}.get(grade or "", "#aaa")

        def fmt(v, t):
            if v is None:
                return "—"
            if t == "cents":
                d = v / 100
                if abs(d) >= 1_000_000:
                    return f"${d/1_000_000:.1f}M"
                return f"${round(d):,}"
            if t == "days":
                return f"{round(v)}d"
            return f"{round(v):,}"

        rows_html += f"""
        <tr>
          <td>{metric['label']}</td>
          <td class="num">{fmt(ytd, metric['type'])}</td>
          <td class="num">{fmt(full, metric['type'])}</td>
          <td class="num">{fmt(annual_target, metric['type'])}</td>
          <td class="center"><span style="color:{grade_color};font-weight:700">{(grade or '—').upper()}</span></td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body {{ font-family: system-ui, sans-serif; font-size: 11px; color: #1a1918; margin: 40px; }}
  h1 {{ font-size: 20px; margin-bottom: 4px; }}
  .sub {{ color: #888; margin-bottom: 24px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .08em;
        color: #888; padding: 6px 8px; border-bottom: 1px solid #ddd; }}
  td {{ padding: 7px 8px; border-bottom: 1px solid #eee; }}
  .num {{ text-align: right; font-family: monospace; }}
  .center {{ text-align: center; }}
  tr:nth-child(even) {{ background: #fafafa; }}
</style>
</head><body>
  <h1>Scoreboard — {year}</h1>
  <div class="sub">{client.name}</div>
  <table>
    <thead><tr>
      <th>Metric</th><th class="num">YTD Actual</th>
      <th class="num">Full Year Forecast</th><th class="num">Annual Target</th>
      <th class="center">Grade</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
  <p style="margin-top:24px;font-size:9px;color:#aaa">
    Generated by ORDOBOOK · {datetime.now(timezone.utc).strftime('%Y-%m-%d')}
  </p>
</body></html>"""


def _action_plan_html(client: Client, year: int, items) -> str:
    rows_html = ""
    for i, item in enumerate(items, 1):
        due = item.due_date.strftime("%b %d, %Y") if item.due_date else "—"
        rows_html += f"""
        <tr>
          <td class="num" style="color:#888">{i}</td>
          <td><strong>{item.objective or "—"}</strong></td>
          <td>{item.current_results or "—"}</td>
          <td>{item.next_steps or "—"}</td>
          <td>{item.owner or "—"}</td>
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
  .num {{ text-align: right; width: 28px; }}
  tr:nth-child(even) {{ background: #fafafa; }}
</style>
</head><body>
  <h1>Action Plan — {year}</h1>
  <div class="sub">{client.name}</div>
  <table>
    <thead><tr>
      <th>#</th><th>Objective</th><th>Current Results</th>
      <th>Next Steps</th><th>Owner</th><th>Due Date</th>
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
        periods = (
            db.query(ForecastPeriod)
            .filter(ForecastPeriod.client_id == client_id, ForecastPeriod.fiscal_year == year)
            .order_by(ForecastPeriod.month)
            .all()
        )
        targets = (
            db.query(ClientTarget)
            .filter(ClientTarget.client_id == client_id, ClientTarget.fiscal_year == year)
            .all()
        )
        grades = {
            g.metric_key: g
            for g in db.query(ScoreboardEntry).filter(
                ScoreboardEntry.client_id == client_id,
                ScoreboardEntry.fiscal_year == year,
            ).all()
        }
        html_content = _scoreboard_html(client, year, periods, targets, grades)

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
