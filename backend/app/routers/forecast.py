from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.client import Client
from app.models.monthly_actuals import MonthlyActuals
from app.models.forecast_config import ForecastConfig
from app.models.forecast_period import ForecastPeriod
from app.schemas.forecast import (
    ForecastConfigCreate,
    ForecastConfigUpdate,
    ForecastConfigOut,
    ForecastPeriodOut,
    ForecastViewOut,
)
from app.engine.forecast import build_forecast_period

router = APIRouter(prefix="/api/clients", tags=["forecast"])


def _get_client_or_404(client_id: int, db: Session) -> Client:
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _get_config_or_404(client_id: int, fiscal_year: int, db: Session) -> ForecastConfig:
    config = db.query(ForecastConfig).filter(
        ForecastConfig.client_id == client_id,
        ForecastConfig.fiscal_year == fiscal_year,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Forecast config not found for this year")
    return config


def _run_calculation(config: ForecastConfig, db: Session) -> list[ForecastPeriod]:
    """Re-run the engine for all 12 months and upsert forecast_periods rows."""
    # Load actuals for this client/year
    actuals_rows = db.query(MonthlyActuals).filter(
        MonthlyActuals.client_id == config.client_id,
        MonthlyActuals.fiscal_year == config.fiscal_year,
    ).all()
    actuals_by_month = {a.month: a.__dict__ for a in actuals_rows}

    config_dict = {
        "small_job_counts": config.small_job_counts or {},
        "small_job_avg_value": config.small_job_avg_value or 0,
        "small_job_avg_value_monthly": config.small_job_avg_value_monthly or {},
        "medium_job_counts": config.medium_job_counts or {},
        "medium_job_avg_value": config.medium_job_avg_value or 0,
        "medium_job_avg_value_monthly": config.medium_job_avg_value_monthly or {},
        "large_job_counts": config.large_job_counts or {},
        "large_job_avg_value": config.large_job_avg_value or 0,
        "large_job_avg_value_monthly": config.large_job_avg_value_monthly or {},
        "cost_per_pay_run": config.cost_per_pay_run or 0,
        "pay_runs_per_month": config.pay_runs_per_month or {},
        "payroll_one_off": config.payroll_one_off or {},
        "owner_distributions": config.owner_distributions or {},
        "owner_tax_savings": config.owner_tax_savings or {},
        "overhead_schedule": config.overhead_schedule or [],
        "other_overhead_monthly": config.other_overhead_monthly or {},
        "cos_pct_monthly": config.cos_pct_monthly or {},
        "marketing_monthly": config.marketing_monthly or {},
        "depreciation_monthly": config.depreciation_monthly or {},
        "other_income_expense_monthly": config.other_income_expense_monthly or {},
    }

    periods = []
    for month in range(1, 13):
        actuals = actuals_by_month.get(month)
        period_data = build_forecast_period(month=month, config=config_dict, actuals=actuals)

        existing = db.query(ForecastPeriod).filter(
            ForecastPeriod.client_id == config.client_id,
            ForecastPeriod.fiscal_year == config.fiscal_year,
            ForecastPeriod.month == month,
        ).first()

        if existing:
            for key, val in period_data.items():
                if key != "month":
                    setattr(existing, key, val)
            existing.config_id = config.id
            existing.updated_at = datetime.now(timezone.utc)
            periods.append(existing)
        else:
            new_period = ForecastPeriod(
                client_id=config.client_id,
                config_id=config.id,
                fiscal_year=config.fiscal_year,
                **period_data,
            )
            db.add(new_period)
            periods.append(new_period)

    db.commit()
    for p in periods:
        db.refresh(p)
    return periods


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{client_id}/forecast/{fiscal_year}", response_model=ForecastViewOut)
def get_forecast_view(client_id: int, fiscal_year: int, db: Session = Depends(get_db)):
    """Return blended 12-month forecast (actuals + projections)."""
    _get_client_or_404(client_id, db)
    config = _get_config_or_404(client_id, fiscal_year, db)
    periods = (
        db.query(ForecastPeriod)
        .filter(
            ForecastPeriod.client_id == client_id,
            ForecastPeriod.fiscal_year == fiscal_year,
        )
        .order_by(ForecastPeriod.month)
        .all()
    )
    return {"config": config, "periods": periods}


@router.get("/{client_id}/forecast/{fiscal_year}/drivers", response_model=ForecastConfigOut)
def get_drivers(client_id: int, fiscal_year: int, db: Session = Depends(get_db)):
    """Return the forecast config (driver inputs) for this year."""
    _get_client_or_404(client_id, db)
    return _get_config_or_404(client_id, fiscal_year, db)


@router.post("/{client_id}/forecast/{fiscal_year}/drivers",
             response_model=ForecastConfigOut, status_code=201)
def create_drivers(
    client_id: int,
    fiscal_year: int,
    payload: ForecastConfigCreate,
    db: Session = Depends(get_db),
):
    """Create initial forecast config for a year. Auto-fills from actuals averages if available."""
    _get_client_or_404(client_id, db)
    existing = db.query(ForecastConfig).filter(
        ForecastConfig.client_id == client_id,
        ForecastConfig.fiscal_year == fiscal_year,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Forecast config already exists for this year")

    data = payload.model_dump()

    # Auto-fill other expense fields from actuals averages if caller didn't provide them
    if not any(data.get(f) for f in [
        "cos_pct_monthly", "marketing_monthly", "depreciation_monthly",
        "other_income_expense_monthly",
    ]):
        actuals_rows = db.query(MonthlyActuals).filter(
            MonthlyActuals.client_id == client_id,
            MonthlyActuals.fiscal_year == fiscal_year,
        ).all()

        if actuals_rows:
            actuals_months = {a.month: a for a in actuals_rows}

            cos_pcts = [
                (a.cost_of_sales / a.revenue * 100)
                for a in actuals_rows if a.revenue > 0
            ]
            avg_cos_pct = round(sum(cos_pcts) / len(cos_pcts), 2) if cos_pcts else 0.0
            avg_marketing = int(
                sum(a.marketing_expenses for a in actuals_rows) / len(actuals_rows))
            avg_depreciation = int(
                sum(a.depreciation_amortization for a in actuals_rows) / len(actuals_rows))
            avg_other = int(
                sum(a.other_income_expense for a in actuals_rows) / len(actuals_rows))

            cos_pct_monthly, marketing_monthly, depreciation_monthly, other_monthly = {}, {}, {}, {}
            for m in range(1, 13):
                if m in actuals_months:
                    a = actuals_months[m]
                    cos_pct_monthly[str(m)] = round(
                        (a.cost_of_sales / a.revenue * 100) if a.revenue > 0 else avg_cos_pct, 2)
                    marketing_monthly[str(m)] = a.marketing_expenses
                    depreciation_monthly[str(m)] = a.depreciation_amortization
                    other_monthly[str(m)] = a.other_income_expense
                else:
                    cos_pct_monthly[str(m)] = avg_cos_pct
                    marketing_monthly[str(m)] = avg_marketing
                    depreciation_monthly[str(m)] = avg_depreciation
                    other_monthly[str(m)] = avg_other

            data["cos_pct_monthly"] = cos_pct_monthly
            data["marketing_monthly"] = marketing_monthly
            data["depreciation_monthly"] = depreciation_monthly
            data["other_income_expense_monthly"] = other_monthly

    config = ForecastConfig(client_id=client_id, **data)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.put("/{client_id}/forecast/{fiscal_year}/drivers", response_model=ForecastConfigOut)
def update_drivers(
    client_id: int,
    fiscal_year: int,
    payload: ForecastConfigUpdate,
    db: Session = Depends(get_db),
):
    """Update driver inputs. Triggers recalculation automatically."""
    _get_client_or_404(client_id, db)
    config = _get_config_or_404(client_id, fiscal_year, db)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(config)

    # Recalculate all 12 months
    _run_calculation(config, db)
    return config


@router.post("/{client_id}/forecast/{fiscal_year}/calculate",
             response_model=list[ForecastPeriodOut])
def calculate_forecast(client_id: int, fiscal_year: int, db: Session = Depends(get_db)):
    """Re-run engine for all 12 months and return updated periods."""
    _get_client_or_404(client_id, db)
    config = _get_config_or_404(client_id, fiscal_year, db)
    return _run_calculation(config, db)


@router.get("/{client_id}/forecast/{fiscal_year}/{month}/trace")
def get_trace(client_id: int, fiscal_year: int, month: int, db: Session = Depends(get_db)):
    """Return the full calc_trace for a specific month."""
    _get_client_or_404(client_id, db)
    period = db.query(ForecastPeriod).filter(
        ForecastPeriod.client_id == client_id,
        ForecastPeriod.fiscal_year == fiscal_year,
        ForecastPeriod.month == month,
    ).first()
    if not period:
        raise HTTPException(status_code=404, detail="No forecast period found for this month")
    return {
        "client_id": client_id,
        "fiscal_year": fiscal_year,
        "month": month,
        "source_type": period.source_type,
        "calc_trace": period.calc_trace,
    }
