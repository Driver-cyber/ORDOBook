from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.client import Client
from app.models.account_mapping import AccountMapping
from app.models.monthly_actuals import MonthlyActuals
from app.parsers.qb_parser import parse_file, parse_invoice_report, detect_report_type
from app.parsers.auto_mapper import suggest_mappings
from app.schemas.ingestion import ParsePreviewResponse, ConfirmRequest

router = APIRouter(prefix="/api/clients", tags=["ingestion"])

MONTH_LABELS = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}


def _parse_period_label(label: str) -> tuple[int, int]:
    """Parse 'January 2026' → (2026, 1). Raises ValueError on bad input."""
    parts = label.strip().split()
    if len(parts) != 2:
        raise ValueError(f"Unexpected period label format: '{label}'")
    month_name, year_str = parts
    month = MONTH_LABELS.get(month_name)
    if not month:
        raise ValueError(f"Unknown month name: '{month_name}'")
    return int(year_str), month


@router.post("/{client_id}/upload", response_model=ParsePreviewResponse)
async def upload_files(
    client_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """
    Parse one or more QB .xlsx exports and return structured data + mapping suggestions.
    Does NOT write to the DB. The advisor reviews suggestions and calls /confirm next.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    # Parse each file
    all_rows = []
    all_periods: set[str] = set()
    report_types = []
    company_name = ""
    source_files = []
    job_counts: dict[str, int] = {}

    for upload in files:
        if not upload.filename.endswith(".xlsx"):
            raise HTTPException(
                status_code=400,
                detail=f"'{upload.filename}' is not an .xlsx file. Only Excel exports are supported."
            )
        file_bytes = await upload.read()
        file_type = detect_report_type(file_bytes)

        if file_type == "invoices_by_month":
            try:
                invoice_data = parse_invoice_report(file_bytes, upload.filename)
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))
            for period, count in invoice_data["job_counts"].items():
                job_counts[period] = job_counts.get(period, 0) + count
            if not company_name:
                company_name = invoice_data["company_name"]
            source_files.append(upload.filename)
            continue

        try:
            parsed = parse_file(file_bytes, upload.filename)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

        all_rows.extend(parsed["rows"])
        all_periods.update(parsed["periods_detected"])
        if parsed["report_type"] not in report_types:
            report_types.append(parsed["report_type"])
        if not company_name:
            company_name = parsed["company_name"]
        source_files.append(upload.filename)

    # Sort periods chronologically — drop any labels that don't parse as "Month YYYY"
    # (e.g. QB sometimes emits a "Dec 31 – Dec 31 2024" sub-period column that should be ignored)
    def period_sort_key(label: str):
        try:
            y, m = _parse_period_label(label)
            return y * 100 + m
        except ValueError:
            return 0

    sorted_periods = sorted(
        [p for p in all_periods if period_sort_key(p) > 0],
        key=period_sort_key,
    )

    # Load existing account mappings for this client
    existing_db_mappings = db.query(AccountMapping).filter(
        AccountMapping.client_id == client_id
    ).all()
    existing_mappings = {
        (m.report_type, m.qb_account_name): m.ordobook_category
        for m in existing_db_mappings
    }

    # Generate mapping suggestions
    suggestions = suggest_mappings(all_rows, existing_mappings)

    return ParsePreviewResponse(
        client_id=client_id,
        report_types=report_types,
        company_name=company_name,
        periods_detected=sorted_periods,
        rows=all_rows,
        suggestions=suggestions,
        job_counts=job_counts,
    )


@router.post("/{client_id}/actuals/confirm")
def confirm_import(
    client_id: int,
    payload: ConfirmRequest,
    db: Session = Depends(get_db),
):
    """
    Save mapping decisions and write monthly_actuals records.
    The frontend computes the aggregated values per period and sends them here.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Save/update account mappings
    for decision in payload.mappings:
        existing = db.query(AccountMapping).filter(
            AccountMapping.client_id == client_id,
            AccountMapping.report_type == decision.report_type,
            AccountMapping.qb_account_name == decision.qb_account_name,
        ).first()
        if existing:
            existing.ordobook_category = decision.ordobook_category
            existing.is_excluded = decision.is_excluded
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(AccountMapping(
                client_id=client_id,
                report_type=decision.report_type,
                qb_account_name=decision.qb_account_name,
                ordobook_category=decision.ordobook_category,
                is_excluded=decision.is_excluded,
            ))

    # Build raw_data payload (audit trail)
    raw_data = {
        "rows": payload.raw_rows,
        "source_files": payload.source_files,
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }

    # Write/update one monthly_actuals record per period
    saved = []
    now = datetime.now(timezone.utc)

    for period in payload.periods:
        try:
            fiscal_year, month = _parse_period_label(period.label)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

        cats = period.categories

        existing_record = db.query(MonthlyActuals).filter(
            MonthlyActuals.client_id == client_id,
            MonthlyActuals.fiscal_year == fiscal_year,
            MonthlyActuals.month == month,
        ).first()

        if existing_record:
            existing_record.revenue = cats.get("revenue", 0)
            existing_record.cost_of_sales = cats.get("cost_of_sales", 0)
            existing_record.payroll_expenses = cats.get("payroll_expenses", 0)
            existing_record.marketing_expenses = cats.get("marketing_expenses", 0)
            existing_record.depreciation_amortization = cats.get("depreciation_amortization", 0)
            existing_record.overhead_expenses = cats.get("overhead_expenses", 0)
            existing_record.total_expenses = cats.get("total_expenses", 0)
            existing_record.other_income_expense = cats.get("other_income_expense", 0)
            existing_record.cash = cats.get("cash", 0)
            existing_record.accounts_receivable = cats.get("accounts_receivable", 0)
            existing_record.inventory = cats.get("inventory", 0)
            existing_record.other_current_assets = cats.get("other_current_assets", 0)
            existing_record.total_fixed_assets = cats.get("total_fixed_assets", 0)
            existing_record.total_other_long_term_assets = cats.get("total_other_long_term_assets", 0)
            existing_record.accounts_payable = cats.get("accounts_payable", 0)
            existing_record.other_current_liabilities = cats.get("other_current_liabilities", 0)
            existing_record.total_long_term_liabilities = cats.get("total_long_term_liabilities", 0)
            existing_record.equity_before_net_profit = cats.get("equity_before_net_profit", 0)
            existing_record.net_profit_for_year = cats.get("net_profit_for_year", 0)
            existing_record.job_count = period.job_count
            existing_record.raw_data = raw_data
            existing_record.source_files = payload.source_files
            existing_record.uploaded_at = now
            existing_record.updated_at = now
            saved.append(existing_record)
        else:
            record = MonthlyActuals(
                client_id=client_id,
                fiscal_year=fiscal_year,
                month=month,
                status="draft",
                revenue=cats.get("revenue", 0),
                cost_of_sales=cats.get("cost_of_sales", 0),
                payroll_expenses=cats.get("payroll_expenses", 0),
                marketing_expenses=cats.get("marketing_expenses", 0),
                depreciation_amortization=cats.get("depreciation_amortization", 0),
                overhead_expenses=cats.get("overhead_expenses", 0),
                total_expenses=cats.get("total_expenses", 0),
                other_income_expense=cats.get("other_income_expense", 0),
                cash=cats.get("cash", 0),
                accounts_receivable=cats.get("accounts_receivable", 0),
                inventory=cats.get("inventory", 0),
                other_current_assets=cats.get("other_current_assets", 0),
                total_fixed_assets=cats.get("total_fixed_assets", 0),
                total_other_long_term_assets=cats.get("total_other_long_term_assets", 0),
                accounts_payable=cats.get("accounts_payable", 0),
                other_current_liabilities=cats.get("other_current_liabilities", 0),
                total_long_term_liabilities=cats.get("total_long_term_liabilities", 0),
                equity_before_net_profit=cats.get("equity_before_net_profit", 0),
                net_profit_for_year=cats.get("net_profit_for_year", 0),
                job_count=period.job_count,
                raw_data=raw_data,
                source_files=payload.source_files,
                uploaded_at=now,
            )
            db.add(record)
            saved.append(record)

    db.commit()
    for r in saved:
        db.refresh(r)

    return {"saved": len(saved), "periods": [p.label for p in payload.periods]}
