"""Presentations: generate, edit, present.

The deliverable is a stored list of typed panels (app.engine.panels). This router
is thin on purpose — it fetches what the generator needs, calls the pure engine,
and persists the result. Every figure in a panel comes from the scoreboard and
targets models that already exist, so the presentation is a new RENDERER over the
same data, never a second opinion about it.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.action_plan import ActionPlanItem
from app.models.client import Client
from app.models.presentation import Presentation
from app.engine.panels import build_panels, merge_authored, fingerprint
from app.routers.targets import get_scoreboard
from app.schemas.presentations import (
    PresentationOut, PresentationSummary, GenerateRequest, PanelEdit,
)

router = APIRouter(prefix="/api/clients", tags=["presentations"])

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def _require_client(client_id: int, db: Session) -> Client:
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _objectives(client_id: int, year: int, db: Session) -> list[dict]:
    rows = (
        db.query(ActionPlanItem)
        .filter(ActionPlanItem.client_id == client_id, ActionPlanItem.fiscal_year == year)
        .order_by(ActionPlanItem.sort_order, ActionPlanItem.id)
        .all()
    )
    return [{
        "id": o.id,
        "objective": o.objective,
        "current_results": o.current_results,
        "steps": [{
            "text": s.text,
            "owners": s.owners or [],
            "due_date": s.due_date.isoformat() if s.due_date else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        } for s in o.steps],
    } for o in rows]


def _prior_presented(client_id: int, year: int, month: int, db: Session) -> Presentation | None:
    """The last presentation actually shown to the client before this period.

    Only a presented one counts — a draft nobody saw is not a commitment, and the
    action_review panel is a record of what was said out loud.
    """
    return (
        db.query(Presentation)
        .filter(Presentation.client_id == client_id,
                Presentation.status == "presented",
                ((Presentation.fiscal_year < year) |
                 ((Presentation.fiscal_year == year) & (Presentation.month < month))))
        .order_by(Presentation.fiscal_year.desc(), Presentation.month.desc(),
                  Presentation.version.desc())
        .first()
    )


def _steps_from(presentation: Presentation | None) -> list[dict]:
    """The action steps a previous presentation committed to.

    Read from the stored panels rather than from today's action plan: the point is
    what was on the page in that meeting, not what the plan says now.
    """
    if not presentation:
        return []
    out = []
    for panel in presentation.panels or []:
        if panel.get("type") == "objective":
            out.extend((panel.get("data") or {}).get("steps") or [])
    return out


def _latest(client_id: int, year: int, month: int, db: Session) -> Presentation | None:
    return (
        db.query(Presentation)
        .filter(Presentation.client_id == client_id,
                Presentation.fiscal_year == year, Presentation.month == month)
        .order_by(Presentation.version.desc())
        .first()
    )


@router.get("/{client_id}/presentations", response_model=list[PresentationSummary])
def list_presentations(client_id: int, db: Session = Depends(get_db)):
    _require_client(client_id, db)
    rows = (
        db.query(Presentation)
        .filter(Presentation.client_id == client_id)
        .order_by(Presentation.fiscal_year.desc(), Presentation.month.desc(),
                  Presentation.version.desc())
        .all()
    )
    return [PresentationSummary(
        id=p.id, fiscal_year=p.fiscal_year, month=p.month, version=p.version,
        title=p.title, status=p.status, panel_count=len(p.panels or []),
        presented_at=p.presented_at, updated_at=p.updated_at,
    ) for p in rows]


@router.post("/{client_id}/presentations/generate", response_model=PresentationOut)
def generate(client_id: int, payload: GenerateRequest, db: Session = Depends(get_db)):
    """Build (or rebuild) the draft for one period.

    Regenerating keeps the advisor's words: a panel they have edited stays
    authored, its figures are refreshed anyway, and it is flagged when those
    figures no longer match what the words were written against. Stale numbers
    under live prose is the one outcome worse than either.

    A presented version is never overwritten — regenerating after a presentation
    opens the next version instead.
    """
    client = _require_client(client_id, db)
    year, month = payload.fiscal_year, payload.month

    scoreboard = get_scoreboard(client_id, year, db)
    if hasattr(scoreboard, "model_dump"):
        scoreboard = scoreboard.model_dump()

    prior = _prior_presented(client_id, year, month, db)
    panels = build_panels(
        scoreboard=scoreboard,
        objectives=_objectives(client_id, year, db),
        prior_steps=_steps_from(prior),
        exception_keys=payload.exception_keys,
    )

    current = _latest(client_id, year, month, db)
    now = datetime.now(timezone.utc)
    title = f"{MONTH_NAMES[month]} {year} — {client.name}"

    if current and current.status == "draft":
        current.panels = merge_authored(panels, current.panels or [])
        current.generated_at = now
        current.updated_at = now
        target = current
    else:
        target = Presentation(
            client_id=client_id, fiscal_year=year, month=month,
            version=(current.version + 1) if current else 1,
            title=title, status="draft",
            panels=merge_authored(panels, current.panels or []) if current else panels,
            generated_at=now,
        )
        db.add(target)

    db.commit()
    db.refresh(target)
    return target


@router.get("/{client_id}/presentations/{presentation_id}", response_model=PresentationOut)
def read(client_id: int, presentation_id: int, db: Session = Depends(get_db)):
    _require_client(client_id, db)
    p = (db.query(Presentation)
         .filter(Presentation.id == presentation_id, Presentation.client_id == client_id)
         .first())
    if not p:
        raise HTTPException(status_code=404, detail="Presentation not found")
    return p


@router.patch("/{client_id}/presentations/{presentation_id}/panel",
              response_model=PresentationOut)
def edit_panel(client_id: int, presentation_id: int, edit: PanelEdit,
               db: Session = Depends(get_db)):
    """Edit one panel's words, or drop it.

    Editing prose flips the panel to `authored` — presence of an edit is the
    switch, so nothing has to be declared up front and clearing the text back to
    empty hands control back to the generator.
    """
    _require_client(client_id, db)
    p = (db.query(Presentation)
         .filter(Presentation.id == presentation_id, Presentation.client_id == client_id)
         .first())
    if not p:
        raise HTTPException(status_code=404, detail="Presentation not found")
    if p.status == "presented":
        raise HTTPException(
            status_code=409,
            detail="This presentation has been presented. Generate a new version to make changes.")

    panels = list(p.panels or [])
    idx = next((i for i, x in enumerate(panels) if x.get("id") == edit.panel_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"No panel '{edit.panel_id}'")

    if edit.drop:
        panels.pop(idx)
    else:
        panel = dict(panels[idx])
        if edit.title is not None:
            panel["title"] = edit.title
        if edit.body is not None:
            panel["body"] = edit.body
        # Presence, not truthiness: an empty title AND body means "give it back to
        # the generator", not "author it as blank".
        authored = bool((panel.get("title") or "").strip() or (panel.get("body") or "").strip())
        panel["mode"] = "authored" if authored else "bound"
        panel["data_fingerprint"] = fingerprint(panel.get("data") or {})
        panel.pop("figures_changed", None)
        panels[idx] = panel

    if edit.move_to is not None and not edit.drop:
        panel = panels.pop(idx)
        panels.insert(max(0, min(edit.move_to, len(panels))), panel)

    p.panels = panels
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return p


@router.post("/{client_id}/presentations/{presentation_id}/present",
             response_model=PresentationOut)
def mark_presented(client_id: int, presentation_id: int, db: Session = Depends(get_db)):
    """Close this version — it is now the record of what was said.

    Not a hard freeze: a later edit opens version n+1, and this one stays readable
    forever. Next month's action_review panel reads from the presented version, so
    what it reports is what was actually on the page in the meeting.
    """
    _require_client(client_id, db)
    p = (db.query(Presentation)
         .filter(Presentation.id == presentation_id, Presentation.client_id == client_id)
         .first())
    if not p:
        raise HTTPException(status_code=404, detail="Presentation not found")
    if p.status != "presented":
        p.status = "presented"
        p.presented_at = datetime.now(timezone.utc)
        p.updated_at = p.presented_at
        db.commit()
        db.refresh(p)
    return p
