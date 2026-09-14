from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.client import Client
from app.models.account_mapping import AccountMapping
from app.models.monthly_actuals import MonthlyActuals
from app.parsers.qb_parser import parse_file, parse_invoice_report, detect_report_type
from app.parsers.auto_mapper import suggest_mappings
from app.engine.category_totals import compute_period_totals, category_accounts
from app.schemas.ingestion import ParsePreviewResponse, ConfirmRequest

router = APIRouter(prefix="/api/clients", tags=["ingestion"])

MONTH_LABELS = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}


MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]

# Category columns written to monthly_actuals, in the order they appear on the model.
_CATEGORY_COLUMNS = (
    "revenue", "cost_of_sales", "payroll_expenses", "marketing_expenses",
    "depreciation_amortization", "overhead_expenses", "total_expenses",
    "other_income_expense", "cash", "accounts_receivable", "inventory",
    "other_current_assets", "total_fixed_assets", "total_other_long_term_assets",
    "accounts_payable", "other_current_liabilities", "total_long_term_liabilities",
    "equity_before_net_profit", "owner_distributions", "net_profit_for_year",
)


def _client_mappings(client_id: int, db: Session) -> dict:
    """{(report_type, qb_account_name): ordobook_category} for this client."""
    return {
        (m.report_type, m.qb_account_name): m.ordobook_category
        for m in db.query(AccountMapping).filter(AccountMapping.client_id == client_id).all()
    }


def _apply_categories(record: MonthlyActuals, cats: dict) -> bool:
    """Write category totals onto a record. Returns True if anything changed."""
    changed = False
    for col in _CATEGORY_COLUMNS:
        new = int(cats.get(col, 0) or 0)
        if getattr(record, col, 0) != new:
            setattr(record, col, new)
            changed = True
    return changed


def recompute_stored_actuals(client_id: int, db: Session) -> dict:
    """Re-derive every stored month's category totals from its own raw rows and
    the client's CURRENT mapping.

    Stored totals are a snapshot taken at import time, so a mapping correction
    afterwards used to mean re-uploading the exports. This replays the arithmetic
    instead. Returns a per-month summary of what moved, so the advisor sees which
    months changed and by how much rather than being told to trust it.
    """
    records = (
        db.query(MonthlyActuals)
        .filter(MonthlyActuals.client_id == client_id)
        .order_by(MonthlyActuals.fiscal_year, MonthlyActuals.month)
        .all()
    )
    mappings = _client_mappings(client_id, db)

    changed, skipped = [], []
    for rec in records:
        rows = (rec.raw_data or {}).get("rows")
        if not rows:
            skipped.append(f"{MONTH_NAMES[rec.month]} {rec.fiscal_year}")
            continue
        label = f"{MONTH_NAMES[rec.month]} {rec.fiscal_year}"
        totals = compute_period_totals(rows, mappings)
        if label not in totals:
            skipped.append(label)
            continue
        before_np = _net_profit(rec)
        if _apply_categories(rec, totals[label]):
            changed.append({
                "period": label,
                "net_profit_before": before_np,
                "net_profit_after": _net_profit(rec),
            })

    if changed:
        db.commit()

    return {
        "months_examined": len(records),
        "months_changed": len(changed),
        "changed": changed,
        "skipped": skipped,
        "tie_out": _tie_out(records),
    }


def _tie_out(records: list) -> dict:
    """Check the recomputed P&L against QuickBooks' own net income.

    The Balance Sheet's equity section carries `net_profit_for_year` — QB's
    cumulative year-to-date net income, computed by QuickBooks from a different
    statement. Running our monthly net profit up against it is a check arrived at
    a different way, which is the only kind that catches an arithmetic error (Red
    Team #3). If every P&L dollar is counted exactly once, these agree.

    Months where QB reports no figure are skipped rather than assumed to be zero.
    """
    mismatches, checked = [], 0
    running = 0
    current_year = None
    for rec in records:                      # ordered by fiscal_year, month
        if rec.fiscal_year != current_year:  # the YTD figure resets each year
            current_year, running = rec.fiscal_year, 0
        running += _net_profit(rec)
        qb_ytd = rec.net_profit_for_year or 0
        if qb_ytd == 0:
            continue
        checked += 1
        if running != qb_ytd:
            mismatches.append({
                "period": f"{MONTH_NAMES[rec.month]} {rec.fiscal_year}",
                "ordobook_ytd": running,
                "quickbooks_ytd": qb_ytd,
                "difference": running - qb_ytd,
            })
    return {"months_checked": checked, "mismatches": mismatches}


def _net_profit(rec: MonthlyActuals) -> int:
    """Revenue − COS − operating expenses + other income/expense."""
    return ((rec.revenue or 0) - (rec.cost_of_sales or 0)
            - (rec.total_expenses or 0) + (rec.other_income_expense or 0))


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


@router.get("/{client_id}/actuals/mapping-review-data", response_model=ParsePreviewResponse)
def get_mapping_review_data(
    client_id: int,
    db: Session = Depends(get_db),
):
    """
    Reconstruct a mapping-review preview from the most recently uploaded import batch.
    Allows the advisor to re-open MappingReview without re-uploading files.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Find the most recently uploaded batch
    latest = (
        db.query(MonthlyActuals)
        .filter(MonthlyActuals.client_id == client_id)
        .order_by(MonthlyActuals.uploaded_at.desc())
        .first()
    )
    if not latest or not latest.raw_data or "rows" not in latest.raw_data:
        raise HTTPException(status_code=404, detail="No import data found for this client")

    raw_rows = latest.raw_data["rows"]
    source_files = latest.source_files or []

    # Derive periods_detected from all values keys across all rows
    all_periods: set[str] = set()
    for row in raw_rows:
        if isinstance(row.get("values"), dict):
            all_periods.update(row["values"].keys())

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

    # Load current account mappings → format as "saved" suggestions
    db_mappings = db.query(AccountMapping).filter(
        AccountMapping.client_id == client_id
    ).all()
    existing_mappings = {
        (m.report_type, m.qb_account_name): m.ordobook_category
        for m in db_mappings
    }

    suggestions = suggest_mappings(raw_rows, existing_mappings)

    # Derive report_types from row sections
    pl_sections = {"income", "cogs", "expenses", "other_income", "other_expenses"}
    bs_sections = {"assets", "liabilities", "liabilities_equity", "equity"}
    report_types = []
    for row in raw_rows:
        section = row.get("section", "")
        if section in pl_sections and "profit_and_loss" not in report_types:
            report_types.append("profit_and_loss")
        if section in bs_sections and "balance_sheet" not in report_types:
            report_types.append("balance_sheet")

    # job_counts from stored monthly_actuals records
    all_records = (
        db.query(MonthlyActuals)
        .filter(MonthlyActuals.client_id == client_id)
        .all()
    )
    job_counts = {
        f"{MONTH_NAMES[r.month]} {r.fiscal_year}": r.job_count
        for r in all_records
        if r.job_count
    }

    return ParsePreviewResponse(
        client_id=client_id,
        report_types=report_types,
        company_name=client.name,
        periods_detected=sorted_periods,
        rows=raw_rows,
        suggestions=suggestions,
        job_counts=job_counts,
    )


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
    files_by_type: dict[str, list[str]] = {}

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
            files_by_type.setdefault("invoices_by_month", []).append(upload.filename)
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
        files_by_type.setdefault(parsed["report_type"], []).append(upload.filename)

    # Upload-shape warnings. An import with no P&L renders a Balance-Sheet-only
    # review screen that looks plausible but silently drops all revenue and
    # expense data — the advisor has to notice the absence. Say it instead.
    warnings: list[str] = []
    labels = {
        "profit_and_loss": "Profit & Loss",
        "balance_sheet": "Balance Sheet",
        "invoices_by_month": "Invoices by Month",
    }
    if "profit_and_loss" not in files_by_type:
        warnings.append(
            "No Profit & Loss file detected — Revenue, Cost of Sales and expense data "
            "won't be imported. Add the P&L export unless this is intentional."
        )
    if "balance_sheet" not in files_by_type:
        warnings.append(
            "No Balance Sheet file detected — cash, receivables, payables and equity "
            "won't be imported. Add the Balance Sheet export unless this is intentional."
        )
    if "invoices_by_month" not in files_by_type:
        warnings.append(
            "No Invoices by Month file — job counts weren't pre-filled. You can enter "
            "them by hand below, or add the invoice export."
        )
    for rtype, names in files_by_type.items():
        if len(names) > 1:
            warnings.append(
                f"{len(names)} {labels.get(rtype, rtype)} files uploaded "
                f"({', '.join(names)}) — their periods were merged. Check that's what you meant."
            )

    # Merge rows for the same account across files.
    #
    # Uploading several exports of the same report (e.g. a 2024 Balance Sheet and
    # a 2025-2026 one) previously produced a duplicate row per account — one per
    # file, each carrying values only for its own periods. That shows every
    # account twice on the review screen and makes mapping ambiguous.
    #
    # Rows are identified by (report section, account name, row type), and their
    # period values are combined. A later file wins for a period both cover; the
    # same account/period should carry the same figure in either export, so this
    # only matters if the exports genuinely disagree.
    merged_rows: dict[tuple, dict] = {}
    for row in all_rows:
        key = (row.get("section", ""), row.get("account_name", ""), row.get("row_type", ""))
        if key in merged_rows:
            merged_rows[key]["values"].update(row.get("values") or {})
        else:
            merged = dict(row)
            merged["values"] = dict(row.get("values") or {})
            merged_rows[key] = merged
    all_rows = list(merged_rows.values())

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
        warnings=warnings,
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

    # The advisor's browser previews category totals live while they reassign
    # accounts, but what gets STORED is recomputed here from the raw rows and the
    # mapping just saved — one formula, server-side (app.engine.category_totals).
    # payload.periods still carries the browser's figures; they are ignored.
    db.flush()
    totals_by_label = compute_period_totals(payload.raw_rows, _client_mappings(client_id, db))

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

        cats = totals_by_label.get(period.label, {})

        existing_record = db.query(MonthlyActuals).filter(
            MonthlyActuals.client_id == client_id,
            MonthlyActuals.fiscal_year == fiscal_year,
            MonthlyActuals.month == month,
        ).first()

        if existing_record:
            _apply_categories(existing_record, cats)
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
                job_count=period.job_count,
                raw_data=raw_data,
                source_files=payload.source_files,
                uploaded_at=now,
            )
            _apply_categories(record, cats)
            db.add(record)
            saved.append(record)

    db.commit()
    for r in saved:
        db.refresh(r)

    return {"saved": len(saved), "periods": [p.label for p in payload.periods]}


@router.post("/{client_id}/actuals/reapply-mapping")
def reapply_mapping(client_id: int, db: Session = Depends(get_db)):
    """Recompute every stored month from its raw rows and the current mapping.

    Category totals are a snapshot taken at import time, so correcting a mapping
    afterwards used to mean re-uploading the QuickBooks exports. This replays the
    arithmetic from the audit-trail rows already on each record.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return recompute_stored_actuals(client_id, db)


@router.get("/{client_id}/actuals/{year}/overhead")
def overhead_schedule(client_id: int, year: int, db: Session = Depends(get_db)):
    """The accounts behind the Overhead line, month by month, for one fiscal year.

    Overhead is the direct sum of the accounts mapped to it, so this is the audit
    trail for that line: open the number, see what it is made of. Each account
    carries its full month history, so the caller can show this month, last month
    and a year-to-date average without a second round trip — the same payload the
    Forecast overhead schedule reads for its Last Month and YTD Avg columns.

    `reconciliation` compares the schedule against the figure stored on each month.
    A non-zero difference means the stored total predates the current mapping —
    "Re-apply Mapping" clears it.
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    records = (
        db.query(MonthlyActuals)
        .filter(MonthlyActuals.client_id == client_id, MonthlyActuals.fiscal_year == year)
        .order_by(MonthlyActuals.month)
        .all()
    )
    mappings = _client_mappings(client_id, db)

    accounts: dict[str, dict] = {}
    reconciliation: dict[str, dict] = {}
    imported_months: list[int] = []

    for rec in records:
        rows = (rec.raw_data or {}).get("rows")
        if not rows:
            continue
        imported_months.append(rec.month)
        label = f"{MONTH_NAMES[rec.month]} {year}"

        month_total = 0
        for acc in category_accounts(rows, mappings, "overhead_expenses"):
            amount = acc["values"].get(label, 0) or 0
            month_total += amount
            entry = accounts.setdefault(acc["account_name"], {
                "account_name": acc["account_name"],
                "section": acc["section"],
                "from_other_section": acc["from_other_section"],
                "months": {},
            })
            entry["months"][str(rec.month)] = amount

        reconciliation[str(rec.month)] = {
            "schedule_total": month_total,
            "stored_total": rec.overhead_expenses or 0,
            "difference": (rec.overhead_expenses or 0) - month_total,
            "status": rec.status,
        }

    # Statement order — the order the accounts appear on the QuickBooks P&L, which
    # is the order Review Mapping lists them in. `accounts` is built by walking
    # each month's rows in file order, so insertion order already carries it; an
    # account that only appears in a later month lands after the earlier ones.
    # Deliberately NOT alphabetical: sub-accounts under a parent (the vehicles
    # under Vehicle Expenses) belong together where the statement puts them.
    ordered = list(accounts.values())

    return {
        "fiscal_year": year,
        "category": "overhead_expenses",
        "imported_months": imported_months,
        "accounts": ordered,
        "reconciliation": reconciliation,
    }
