from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.action_plan import ActionPlanItem, ActionPlanStep
from app.schemas.action_plan import (
    ActionPlanItemCreate, ActionPlanItemUpdate,
    ActionPlanItemOut, ActionPlanResponse,
    ActionPlanStepCreate, ActionPlanStepUpdate, ActionPlanStepOut,
)

router = APIRouter(prefix="/api/clients", tags=["action-plan"])

# The "3 objectives × 3 action items" guidance is advisor-guided (the UI greys
# out the add button); nothing here enforces it, same as the Scoreboard's
# three red priorities.


def _get_item_or_404(client_id: int, year: int, item_id: int, db: Session) -> ActionPlanItem:
    item = db.query(ActionPlanItem).filter(
        ActionPlanItem.id == item_id,
        ActionPlanItem.client_id == client_id,
        ActionPlanItem.fiscal_year == year,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Objective not found")
    return item


def _clean_owners(owners):
    """Trim, drop blanks, keep first occurrence order."""
    seen, out = set(), []
    for o in owners or []:
        name = (o or "").strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            out.append(name)
    return out


# ── Objectives ───────────────────────────────────────────────────────────────

@router.get("/{client_id}/action-plan/{year}", response_model=ActionPlanResponse)
def get_action_plan(client_id: int, year: int, db: Session = Depends(get_db)):
    items = (
        db.query(ActionPlanItem)
        .filter(ActionPlanItem.client_id == client_id, ActionPlanItem.fiscal_year == year)
        .order_by(ActionPlanItem.sort_order, ActionPlanItem.id)
        .all()
    )
    return ActionPlanResponse(
        fiscal_year=year,
        items=[ActionPlanItemOut.model_validate(i) for i in items],
    )


@router.post("/{client_id}/action-plan/{year}", response_model=ActionPlanItemOut)
def create_action_plan_item(
    client_id: int, year: int, body: ActionPlanItemCreate, db: Session = Depends(get_db)
):
    count = (
        db.query(ActionPlanItem)
        .filter(ActionPlanItem.client_id == client_id, ActionPlanItem.fiscal_year == year)
        .count()
    )
    item = ActionPlanItem(
        client_id=client_id,
        fiscal_year=year,
        sort_order=body.sort_order if body.sort_order is not None else count,
        objective=body.objective,
        current_results=body.current_results,
        notes=body.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ActionPlanItemOut.model_validate(item)


@router.patch("/{client_id}/action-plan/{year}/{item_id}", response_model=ActionPlanItemOut)
def update_action_plan_item(
    client_id: int, year: int, item_id: int,
    body: ActionPlanItemUpdate, db: Session = Depends(get_db),
):
    item = _get_item_or_404(client_id, year, item_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return ActionPlanItemOut.model_validate(item)


@router.delete("/{client_id}/action-plan/{year}/{item_id}")
def delete_action_plan_item(
    client_id: int, year: int, item_id: int, db: Session = Depends(get_db)
):
    item = _get_item_or_404(client_id, year, item_id, db)
    db.delete(item)   # steps cascade
    db.commit()
    return {"status": "ok"}


@router.put("/{client_id}/action-plan/{year}/order", response_model=ActionPlanResponse)
def reorder_action_plan(client_id: int, year: int, item_ids: list[int], db: Session = Depends(get_db)):
    """Set objective order from a list of ids (first = top)."""
    items = {
        i.id: i for i in db.query(ActionPlanItem).filter(
            ActionPlanItem.client_id == client_id, ActionPlanItem.fiscal_year == year
        ).all()
    }
    for pos, item_id in enumerate(item_ids):
        if item_id in items:
            items[item_id].sort_order = pos
    db.commit()
    return get_action_plan(client_id, year, db)


# ── Steps ────────────────────────────────────────────────────────────────────

@router.post("/{client_id}/action-plan/{year}/{item_id}/steps", response_model=ActionPlanStepOut)
def create_step(
    client_id: int, year: int, item_id: int,
    body: ActionPlanStepCreate, db: Session = Depends(get_db),
):
    item = _get_item_or_404(client_id, year, item_id, db)
    step = ActionPlanStep(
        item_id=item.id,
        sort_order=body.sort_order if body.sort_order is not None else len(item.steps),
        text=body.text,
        owners=_clean_owners(body.owners),
        due_date=body.due_date,
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return ActionPlanStepOut.model_validate(step)


@router.patch("/{client_id}/action-plan/{year}/{item_id}/steps/{step_id}", response_model=ActionPlanStepOut)
def update_step(
    client_id: int, year: int, item_id: int, step_id: int,
    body: ActionPlanStepUpdate, db: Session = Depends(get_db),
):
    _get_item_or_404(client_id, year, item_id, db)
    step = db.query(ActionPlanStep).filter(
        ActionPlanStep.id == step_id, ActionPlanStep.item_id == item_id
    ).first()
    if not step:
        raise HTTPException(status_code=404, detail="Action item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "owners":
            value = _clean_owners(value)
        setattr(step, field, value)
    db.commit()
    db.refresh(step)
    return ActionPlanStepOut.model_validate(step)


@router.delete("/{client_id}/action-plan/{year}/{item_id}/steps/{step_id}")
def delete_step(
    client_id: int, year: int, item_id: int, step_id: int, db: Session = Depends(get_db)
):
    _get_item_or_404(client_id, year, item_id, db)
    step = db.query(ActionPlanStep).filter(
        ActionPlanStep.id == step_id, ActionPlanStep.item_id == item_id
    ).first()
    if not step:
        raise HTTPException(status_code=404, detail="Action item not found")
    db.delete(step)
    db.commit()
    return {"status": "ok"}


@router.put("/{client_id}/action-plan/{year}/{item_id}/steps/order", response_model=ActionPlanItemOut)
def reorder_steps(
    client_id: int, year: int, item_id: int, step_ids: list[int], db: Session = Depends(get_db)
):
    """Set action-item order within an objective from a list of ids."""
    item = _get_item_or_404(client_id, year, item_id, db)
    by_id = {s.id: s for s in item.steps}
    for pos, sid in enumerate(step_ids):
        if sid in by_id:
            by_id[sid].sort_order = pos
    db.commit()
    db.refresh(item)
    return ActionPlanItemOut.model_validate(item)
