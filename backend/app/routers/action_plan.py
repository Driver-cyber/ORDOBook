from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.action_plan import ActionPlanItem
from app.schemas.action_plan import (
    ActionPlanItemCreate, ActionPlanItemUpdate,
    ActionPlanItemOut, ActionPlanResponse,
)

router = APIRouter(prefix="/api/clients", tags=["action-plan"])


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
        sort_order=body.sort_order or count,
        objective=body.objective,
        current_results=body.current_results,
        next_steps=body.next_steps,
        owner=body.owner,
        due_date=body.due_date,
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
    item = db.query(ActionPlanItem).filter(
        ActionPlanItem.id == item_id,
        ActionPlanItem.client_id == client_id,
        ActionPlanItem.fiscal_year == year,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return ActionPlanItemOut.model_validate(item)


@router.delete("/{client_id}/action-plan/{year}/{item_id}")
def delete_action_plan_item(
    client_id: int, year: int, item_id: int, db: Session = Depends(get_db)
):
    item = db.query(ActionPlanItem).filter(
        ActionPlanItem.id == item_id,
        ActionPlanItem.client_id == client_id,
        ActionPlanItem.fiscal_year == year,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"status": "ok"}
