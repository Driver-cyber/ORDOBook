from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.client import Client
from app.models.monthly_actuals import MonthlyActuals
from app.schemas.actuals import ActualsListItem, ActualsDetail, ActualsUpdate

router = APIRouter(prefix="/api/clients", tags=["actuals"])

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


@router.get("/{client_id}/actuals", response_model=list[ActualsListItem])
def list_actuals(client_id: int, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return (
        db.query(MonthlyActuals)
        .filter(MonthlyActuals.client_id == client_id)
        .order_by(MonthlyActuals.fiscal_year, MonthlyActuals.month)
        .all()
    )


@router.get("/{client_id}/actuals/{year}/{month}", response_model=ActualsDetail)
def get_actuals(client_id: int, year: int, month: int, db: Session = Depends(get_db)):
    record = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == client_id,
        MonthlyActuals.fiscal_year == year,
        MonthlyActuals.month == month,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="No actuals found for this period")
    return record


@router.put("/{client_id}/actuals/{year}/{month}", response_model=ActualsDetail)
def update_actuals(
    client_id: int,
    year: int,
    month: int,
    payload: ActualsUpdate,
    db: Session = Depends(get_db),
):
    record = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == client_id,
        MonthlyActuals.fiscal_year == year,
        MonthlyActuals.month == month,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="No actuals found for this period")

    if payload.job_count is not None:
        record.job_count = payload.job_count
    if payload.status is not None:
        record.status = payload.status
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record
