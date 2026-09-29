"""Tax return preparation (prepare-only: vendors file on TaxPro-Max, then mark as filed)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from ...core.config import settings
from ...models.bisonbook import BBExpense, JournalEntry, JournalLine, TaxReturn
from ...models.vendor import Vendor, VendorAdvice
from ..vendor_onboarding import can_charge_vat, vat_status_of
from . import ledger
from .common import BisonBookError, add_months, month_bounds, money, naira, table_pdf, to_csv
from .storage import access_url, save_vendor_bytes

TAX_TYPES = {"vat", "wht", "cit"}
TAX_LABELS = {"vat": "VAT return", "wht": "WHT remittance", "cit": "Company income tax"}
FILING_PROVIDERS = {"manual"}  # hook: add a licensed API partner key here later


def _account_movement(db: Session, vendor: Vendor, key: str, start: date, end: date) -> tuple[float, float]:
    account = ledger.account_by_key(db, vendor, key)
    dr = cr = 0.0
    for line, _entry in (
        db.query(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .filter(JournalEntry.vendor_id == vendor.id, JournalLine.account_id == account.id,
                JournalEntry.entry_date >= start, JournalEntry.entry_date <= end)
    ):
        dr += line.debit or 0
        cr += line.credit or 0
    return money(dr), money(cr)


def period_for(tax_type: str, year: int, month: Optional[int], vendor_fy_end: int = 12) -> tuple[date, date, date]:
    if tax_type in {"vat", "wht"}:
        if not month:
            raise BisonBookError("Pick the month for this return.")
        start, end = month_bounds(year, month)
        nxt = add_months(start, 1)
        return start, end, date(nxt.year, nxt.month, 21)
    end = month_bounds(year, vendor_fy_end)[1]
    start = add_months(date(end.year, end.month, 1), -11)
    due_month = add_months(date(end.year, end.month, 1), 6)
    due = month_bounds(due_month.year, due_month.month)[1]
    return start, end, due


def compute_vat(db: Session, vendor: Vendor, start: date, end: date) -> Dict:
    if not can_charge_vat(vendor):
        raise BisonBookError(
            "VAT returns are only prepared for VAT-approved vendors. Upload your VAT certificate and tax clearance first."
        )
    sales_dr, sales_cr = _account_movement(db, vendor, "sales", start, end)
    out_dr, out_cr = _account_movement(db, vendor, "vat_output", start, end)
    in_dr, in_cr = _account_movement(db, vendor, "vat_input", start, end)
    output_vat = money(out_cr - out_dr)
    input_vat = money(in_dr - in_cr)
    net = money(output_vat - input_vat)
    return {
        "vat_rate": settings.VAT_RATE,
        "total_sales": money(sales_cr - sales_dr),
        "output_vat": output_vat,
        "input_vat": input_vat,
        "net_vat_payable": max(net, 0.0),
        "vat_credit_carried_forward": abs(net) if net < 0 else 0.0,
        "_payable": max(net, 0.0),
    }


def compute_wht(db: Session, vendor: Vendor, start: date, end: date) -> Dict:
    rows = (
        db.query(BBExpense)
        .filter(BBExpense.vendor_id == vendor.id, BBExpense.wht_amount > 0,
                BBExpense.expense_date >= start, BBExpense.expense_date <= end)
        .order_by(BBExpense.expense_date)
        .all()
    )
    withheld = money(sum(r.wht_amount or 0 for r in rows))
    rec_dr, rec_cr = _account_movement(db, vendor, "wht_receivable", start, end)
    return {
        "schedule": [
            {"date": r.expense_date.isoformat(), "supplier": r.supplier or "-", "description": r.description or "",
             "gross": money(r.total), "wht": money(r.wht_amount)}
            for r in rows
        ],
        "wht_withheld_from_suppliers": withheld,
        "wht_credits_received_from_customers": money(rec_dr - rec_cr),
        "_payable": withheld,
    }


def compute_cit(db: Session, vendor: Vendor, start: date, end: date) -> Dict:
    pnl = ledger.profit_and_loss(db, vendor, start, end)
    turnover = pnl["total_income"]
    if turnover <= settings.CIT_SMALL_TURNOVER:
        tier, rate = "small", settings.CIT_SMALL_RATE
    elif turnover <= settings.CIT_MEDIUM_TURNOVER:
        tier, rate = "medium", settings.CIT_MEDIUM_RATE
    else:
        tier, rate = "large", settings.CIT_LARGE_RATE
    profit = pnl["net_profit"]
    tax = money(max(profit, 0) * rate / 100)
    rec_dr, rec_cr = _account_movement(db, vendor, "wht_receivable", start, end)
    credits = money(rec_dr - rec_cr)
    return {
        "turnover": turnover,
        "cost_of_sales": pnl["cost_of_sales"],
        "gross_profit": pnl["gross_profit"],
        "total_expenses": pnl["total_expenses"],
        "assessable_profit": profit,
        "company_size": tier,
        "cit_rate": rate,
        "cit_before_credits": tax,
        "wht_credits": credits,
        "estimate_note": "Estimate from BisonBook records. Confirm capital allowances and adjustments with your tax adviser.",
        "_payable": max(money(tax - credits), 0.0),
    }


COMPUTE = {"vat": compute_vat, "wht": compute_wht, "cit": compute_cit}


def _figure_rows(figures: Dict) -> List[List]:
    rows = []
    for key, value in figures.items():
        if key.startswith("_") or key == "schedule":
            continue
        label = key.replace("_", " ").capitalize()
        if isinstance(value, (int, float)) and not key.endswith("rate"):
            rows.append([label, naira(value)])
        elif key.endswith("rate"):
            rows.append([label, f"{value:g}%"])
        else:
            rows.append([label, str(value)])
    return rows


def generate_return(db: Session, vendor: Vendor, tax_type: str, year: int, month: Optional[int]) -> TaxReturn:
    if tax_type not in TAX_TYPES:
        raise BisonBookError("Tax type must be vat, wht or cit.")
    from .common import get_settings

    start, end, due = period_for(tax_type, year, month, get_settings(db, vendor).financial_year_end_month or 12)
    if start > date.today():
        raise BisonBookError("That period has not started yet.")
    row = (
        db.query(TaxReturn)
        .filter(TaxReturn.vendor_id == vendor.id, TaxReturn.tax_type == tax_type, TaxReturn.period_start == start)
        .first()
    )
    if row and row.status == "filed":
        raise BisonBookError("This return is already marked as filed.")
    figures = COMPUTE[tax_type](db, vendor, start, end)
    payable = money(figures.pop("_payable", 0))
    if not row:
        row = TaxReturn(vendor_id=vendor.id, tax_type=tax_type, period_start=start, period_end=end)
        db.add(row)
    row.due_date = due
    row.figures = figures
    row.amount_payable = payable
    row.status = "ready"
    row.filing_provider = "manual"
    db.flush()

    period = f"{start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')}"
    subtitle = (
        f"{vendor.company_name} &middot; TIN {vendor.tin or 'not set'} &middot; {period}<br/>"
        f"Due {due.strftime('%d %b %Y')} &middot; Amount payable <b>{naira(payable)}</b>"
    )
    rows = _figure_rows(figures)
    rows.append(["Amount payable", naira(payable)])
    body_headers, body_rows = ["Item", "Amount"], rows
    if tax_type == "wht" and figures.get("schedule"):
        body_rows = rows + [["", ""], ["Schedule", ""]] + [
            [f"{s['date']} {s['supplier']}", naira(s["wht"])] for s in figures["schedule"]
        ]
    pdf = table_pdf(
        TAX_LABELS[tax_type], subtitle, body_headers, body_rows,
        footer="Prepared by BisonBook. File this return on FIRS TaxPro-Max, then mark it as filed in BisonBook.",
    )
    csv_rows = [[label, value] for label, value in rows]
    if tax_type == "wht":
        csv_rows += [[], ["date", "supplier", "description", "gross", "wht"]] + [
            [s["date"], s["supplier"], s["description"], s["gross"], s["wht"]] for s in figures.get("schedule", [])
        ]
    csv_bytes = to_csv(["field", "value"], csv_rows)
    stem = f"{tax_type.upper()}_{start.strftime('%Y-%m')}" if tax_type != "cit" else f"CIT_FY{end.year}"
    pdf_row = save_vendor_bytes(db, vendor, pdf, filename=f"{stem}.pdf", folder="Tax returns",
                                mime="application/pdf", source_type="tax_return_pdf", source_id=row.id, replace_source=True)
    csv_row = save_vendor_bytes(db, vendor, csv_bytes, filename=f"{stem}.csv", folder="Tax returns",
                                mime="text/csv", source_type="tax_return_csv", source_id=row.id, replace_source=True)
    row.pdf_url = pdf_row.url
    row.csv_url = csv_row.url
    db.flush()
    return row


def mark_filed(db: Session, vendor: Vendor, row: TaxReturn, reference: Optional[str], receipt_url: Optional[str]) -> TaxReturn:
    if row.status == "filed":
        raise BisonBookError("Already marked as filed.")
    if row.status != "ready":
        raise BisonBookError("Generate the return before marking it as filed.")
    if not (reference or "").strip() and not receipt_url:
        raise BisonBookError("Add the TaxPro-Max reference or upload the filing receipt.")
    row.filing_reference = (reference or "").strip() or None
    if receipt_url:
        row.receipt_url = receipt_url
    row.status = "filed"
    row.filed_at = datetime.utcnow()
    db.flush()
    return row


def serialize_return(row: TaxReturn) -> dict:
    return {
        "id": row.id,
        "tax_type": row.tax_type,
        "label": TAX_LABELS.get(row.tax_type, row.tax_type),
        "period_start": row.period_start,
        "period_end": row.period_end,
        "due_date": row.due_date,
        "figures": row.figures or {},
        "amount_payable": money(row.amount_payable),
        "status": row.status,
        "overdue": row.status != "filed" and row.due_date < date.today(),
        "pdf_url": access_url(row.pdf_url),
        "csv_url": access_url(row.csv_url),
        "filing_provider": row.filing_provider,
        "filing_reference": row.filing_reference,
        "receipt_url": access_url(row.receipt_url),
        "filed_at": row.filed_at,
    }


def deadline_calendar(db: Session, vendor: Vendor, months_back: int = 6) -> List[Dict]:
    from .common import get_settings

    today = date.today()
    existing = {
        (r.tax_type, r.period_start): r
        for r in db.query(TaxReturn).filter(TaxReturn.vendor_id == vendor.id).all()
    }
    vat_enabled = can_charge_vat(vendor)
    items: List[Dict] = []
    first_of_month = date(today.year, today.month, 1)
    for offset in range(months_back, 0, -1):
        start = add_months(first_of_month, -offset)
        for tax_type in ("vat", "wht"):
            if tax_type == "vat" and not vat_enabled and (tax_type, start) not in existing:
                continue
            s, e, due = period_for(tax_type, start.year, start.month)
            items.append(_calendar_item(tax_type, s, e, due, existing.get((tax_type, s)), today))
    fy_end_month = get_settings(db, vendor).financial_year_end_month or 12
    fy_year = today.year - 1 if today.month <= fy_end_month else today.year
    s, e, due = period_for("cit", fy_year, None, fy_end_month)
    if e < today:
        items.append(_calendar_item("cit", s, e, due, existing.get(("cit", s)), today))
    items.sort(key=lambda i: i["due_date"])
    return items


def _calendar_item(tax_type: str, start: date, end: date, due: date, row: Optional[TaxReturn], today: date) -> Dict:
    status = row.status if row else "not_started"
    return {
        "tax_type": tax_type,
        "label": TAX_LABELS[tax_type],
        "period_start": start,
        "period_end": end,
        "period_label": start.strftime("%b %Y") if tax_type != "cit" else f"FY {end.year}",
        "year": start.year if tax_type != "cit" else end.year,
        "month": start.month if tax_type != "cit" else None,
        "due_date": due,
        "status": status,
        "return_id": row.id if row else None,
        "amount_payable": money(row.amount_payable) if row else None,
        "overdue": status != "filed" and due < today,
        "due_soon": status != "filed" and 0 <= (due - today).days <= 7,
    }


def create_deadline_reminders(db: Session, vendor: Vendor) -> int:
    """Post one advice note per upcoming/overdue return so it shows in the vendor's ProcureX advice list."""
    created = 0
    existing = {
        a.message
        for a in db.query(VendorAdvice).filter(VendorAdvice.vendor_id == vendor.id, VendorAdvice.created_by == "BisonBook")
    }
    for item in deadline_calendar(db, vendor):
        if not (item["overdue"] or item["due_soon"]):
            continue
        state = "is overdue" if item["overdue"] else "is due soon"
        message = (
            f"{item['label']} for {item['period_label']} {state} "
            f"(due {item['due_date'].strftime('%d %b %Y')}). Prepare it in BisonBook > Tax and file on TaxPro-Max."
        )
        if message in existing:
            continue
        db.add(VendorAdvice(vendor_id=vendor.id, message=message, created_by="BisonBook"))
        created += 1
    if created:
        db.flush()
    return created


def vat_summary(vendor: Vendor) -> Dict:
    return {"vat_status": vat_status_of(vendor), "can_charge_vat": can_charge_vat(vendor), "vat_rate": settings.VAT_RATE}
