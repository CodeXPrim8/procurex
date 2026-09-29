"""BisonBook API: vendor back-office. Every route is scoped to the caller's vendor account."""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..models.bisonbook import (
    BBAccount,
    BBCustomer,
    BBExpense,
    JournalEntry,
    JournalLine,
    SalesDocument,
    StockMovement,
    TaxReturn,
    VendorFile,
)
from ..models.user import User
from ..models.vendor import Vendor
from ..services.bisonbook import expenses as expense_svc
from ..services.bisonbook import inventory as inventory_svc
from ..services.bisonbook import ledger
from ..services.bisonbook import sales as sales_svc
from ..services.bisonbook import storage
from ..services.bisonbook import tax as tax_svc
from ..services.bisonbook.common import BisonBookError, get_settings, money, table_pdf, to_csv, to_date
from ..services.vendor_onboarding import can_list_products, vat_payload
from .dependencies import get_current_user, is_admin_user, is_superadmin

router = APIRouter(prefix="/bisonbook", tags=["bisonbook"])

SALES_BLOCKED = "Your vendor account must be verified before you can issue quotes or invoices."


def _vendor(db: Session, user: User) -> Vendor:
    if is_superadmin(user):
        raise HTTPException(status_code=403, detail="BisonBook is for vendor accounts. Use Vendor review to inspect a vendor.")
    vendor = db.query(Vendor).filter(Vendor.user_id == user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    return vendor


def _actor(user: User) -> str:
    return user.email or f"user:{user.id}"


def _run(db: Session, fn: Callable[[], Any]) -> Any:
    try:
        result = fn()
        db.commit()
        return result
    except BisonBookError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


def _require_sales(vendor: Vendor) -> None:
    if not can_list_products(vendor):
        raise HTTPException(status_code=403, detail=SALES_BLOCKED)


def _range(start: Optional[str], end: Optional[str]) -> tuple[Optional[date], Optional[date]]:
    try:
        return (to_date(start) if start else None, to_date(end) if end else None)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD.")


# ---------------------------------------------------------------------------
# Overview + settings
# ---------------------------------------------------------------------------

def _overview(db: Session, vendor: Vendor, *, create_reminders: bool) -> Dict:
    today = date.today()
    month_start = date(today.year, today.month, 1)
    inv = inventory_svc.inventory_overview(db, vendor)
    pnl = ledger.profit_and_loss(db, vendor, month_start, today)
    docs = db.query(SalesDocument).filter(SalesDocument.vendor_id == vendor.id).all()
    open_invoices = [d for d in docs if d.kind == "invoice" and d.status in {"issued", "partially_paid"}]
    overdue = [d for d in open_invoices if (d.due_date or d.issue_date) < today]
    bal = ledger.balances(db, vendor)
    cash = 0.0
    for key in ("cash", "bank"):
        account = ledger.account_by_key(db, vendor, key)
        dr, cr = bal.get(account.id, (0.0, 0.0))
        cash += dr - cr
    if create_reminders:
        tax_svc.create_deadline_reminders(db, vendor)
    deadlines = [d for d in tax_svc.deadline_calendar(db, vendor) if d["status"] != "filed"][:6]
    return {
        "company_name": vendor.company_name,
        "can_sell": can_list_products(vendor),
        "vat": vat_payload(vendor),
        "inventory": {
            "sku_count": len(inv["items"]),
            "total_value": inv["total_value"],
            "total_retail_value": inv["total_retail_value"],
            "low_stock_count": inv["low_stock_count"],
            "out_of_stock_count": inv["out_of_stock_count"],
        },
        "sales": {
            "open_invoices": len(open_invoices),
            "receivable": money(sum(d.total - (d.amount_paid or 0) for d in open_invoices)),
            "overdue_invoices": len(overdue),
            "overdue_amount": money(sum(d.total - (d.amount_paid or 0) for d in overdue)),
            "open_quotes": sum(1 for d in docs if d.kind == "quote" and d.status in {"draft", "sent", "accepted"}),
        },
        "month": {
            "income": pnl["total_income"],
            "expenses": pnl["total_expenses"],
            "net_profit": pnl["net_profit"],
        },
        "cash_and_bank": money(cash),
        "deadlines": deadlines,
        "storage": {"used_bytes": storage.used_bytes(db, vendor), "quota_bytes": storage.quota_bytes()},
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: _overview(db, vendor, create_reminders=True))


def _serialize_settings(row) -> Dict:
    return {
        "low_stock_threshold": row.low_stock_threshold,
        "payment_terms_days": row.payment_terms_days,
        "quote_valid_days": row.quote_valid_days,
        "financial_year_end_month": row.financial_year_end_month,
        "locked_through": row.locked_through,
    }


@router.get("/settings")
def read_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: _serialize_settings(get_settings(db, vendor)))


@router.put("/settings")
def update_settings(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        row = get_settings(db, vendor)
        for key, lo, hi in (("low_stock_threshold", 0, 100000), ("payment_terms_days", 0, 365),
                            ("quote_valid_days", 1, 365), ("financial_year_end_month", 1, 12)):
            if key in payload and payload[key] is not None:
                value = int(payload[key])
                if not lo <= value <= hi:
                    raise BisonBookError(f"{key.replace('_', ' ').capitalize()} must be between {lo} and {hi}.")
                setattr(row, key, value)
        if "locked_through" in payload:
            row.locked_through = to_date(payload["locked_through"]) if payload["locked_through"] else None
            if row.locked_through and row.locked_through > date.today():
                raise BisonBookError("You can only lock periods that have ended.")
        return _serialize_settings(row)

    return _run(db, work)


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

@router.get("/inventory")
def inventory(method: str = Query("average", pattern="^(average|fifo)$"),
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: inventory_svc.inventory_overview(db, vendor, method))


@router.get("/inventory/movements")
def movements(vendor_product_id: Optional[int] = None, limit: int = Query(100, le=500),
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    query = (
        db.query(StockMovement)
        .options(joinedload(StockMovement.vendor_product))
        .filter(StockMovement.vendor_id == vendor.id)
    )
    if vendor_product_id:
        query = query.filter(StockMovement.vendor_product_id == vendor_product_id)
    rows = query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit).all()
    return [inventory_svc.serialize_movement(r) for r in rows]


@router.post("/inventory/{listing_id}/movements")
def add_movement(listing_id: int, payload: Dict = Body(...),
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        listing = inventory_svc.listing_for_vendor(db, vendor, listing_id)
        kind = payload.get("movement_type")
        if kind not in {"in", "out", "adjust", "return"}:
            raise BisonBookError("Choose restock, remove, adjust or customer return.")
        qty = int(payload.get("quantity") or 0)
        if kind in {"in", "return"}:
            qty = abs(qty)
        elif kind == "out":
            qty = -abs(qty)
        unit_cost = payload.get("unit_cost")
        move = inventory_svc.record_movement(
            db, vendor, listing, movement_type=kind, quantity=qty,
            unit_cost=float(unit_cost) if unit_cost not in (None, "") else None,
            reference=(payload.get("reference") or "").strip() or None,
            note=(payload.get("note") or "").strip() or None,
            paid_via=payload.get("paid_via"), created_by=_actor(user),
        )
        return {"movement": inventory_svc.serialize_movement(move), "stock_quantity": listing.stock_quantity}

    return _run(db, work)


@router.put("/inventory/{listing_id}/cost")
def set_cost(listing_id: int, payload: Dict = Body(...),
             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        listing = inventory_svc.listing_for_vendor(db, vendor, listing_id)
        cost = float(payload.get("unit_cost") or 0)
        if cost < 0:
            raise BisonBookError("Cost cannot be negative.")
        listing.unit_cost = money(cost)
        return {"vendor_product_id": listing.id, "unit_cost": listing.unit_cost}

    return _run(db, work)


# ---------------------------------------------------------------------------
# Customers + sales documents
# ---------------------------------------------------------------------------

@router.get("/customers")
def customers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    rows = db.query(BBCustomer).filter(BBCustomer.vendor_id == vendor.id).order_by(BBCustomer.name).all()
    return [sales_svc.serialize_customer(r) for r in rows]


@router.post("/customers")
def create_customer(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: sales_svc.serialize_customer(sales_svc.upsert_customer(db, vendor, payload)))


@router.put("/customers/{customer_id}")
def update_customer(customer_id: int, payload: Dict = Body(...),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: sales_svc.serialize_customer(sales_svc.upsert_customer(db, vendor, payload, customer_id)))


@router.get("/sales")
def list_sales(kind: Optional[str] = None, status: Optional[str] = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    query = (
        db.query(SalesDocument)
        .options(joinedload(SalesDocument.lines), joinedload(SalesDocument.payments))
        .filter(SalesDocument.vendor_id == vendor.id)
    )
    if kind:
        query = query.filter(SalesDocument.kind == kind)
    if status:
        query = query.filter(SalesDocument.status == status)
    rows = query.order_by(SalesDocument.created_at.desc()).all()
    return [sales_svc.serialize_document(d) for d in rows]


@router.post("/sales")
def create_sale(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    _require_sales(vendor)
    return _run(db, lambda: sales_svc.serialize_document(
        sales_svc.create_document(db, vendor, payload.get("kind") or "invoice", payload)
    ))


@router.get("/sales/{doc_id}")
def get_sale(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: sales_svc.serialize_document(sales_svc.get_document(db, vendor, doc_id)))


@router.put("/sales/{doc_id}")
def update_sale(doc_id: int, payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    _require_sales(vendor)
    return _run(db, lambda: sales_svc.serialize_document(
        sales_svc.update_document(db, vendor, sales_svc.get_document(db, vendor, doc_id), payload)
    ))


@router.delete("/sales/{doc_id}")
def delete_sale(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        sales_svc.delete_draft(db, vendor, sales_svc.get_document(db, vendor, doc_id))
        return {"deleted": True}

    return _run(db, work)


@router.post("/sales/{doc_id}/issue")
def issue_sale(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    _require_sales(vendor)
    return _run(db, lambda: sales_svc.serialize_document(
        sales_svc.issue_invoice(db, vendor, sales_svc.get_document(db, vendor, doc_id), _actor(user))
    ))


@router.post("/sales/{doc_id}/status")
def quote_status(doc_id: int, payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: sales_svc.serialize_document(
        sales_svc.set_quote_status(db, vendor, sales_svc.get_document(db, vendor, doc_id), payload.get("status"))
    ))


@router.post("/sales/{doc_id}/convert")
def convert_sale(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    _require_sales(vendor)
    return _run(db, lambda: sales_svc.serialize_document(
        sales_svc.convert_quote(db, vendor, sales_svc.get_document(db, vendor, doc_id))
    ))


@router.post("/sales/{doc_id}/payments")
def pay_sale(doc_id: int, payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        doc = sales_svc.get_document(db, vendor, doc_id)
        sales_svc.record_payment(db, vendor, doc, payload, _actor(user))
        return sales_svc.serialize_document(doc)

    return _run(db, work)


@router.post("/sales/{doc_id}/void")
def void_sale(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: sales_svc.serialize_document(
        sales_svc.void_invoice(db, vendor, sales_svc.get_document(db, vendor, doc_id), _actor(user))
    ))


@router.get("/sales/{doc_id}/pdf")
def sale_pdf(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        doc = sales_svc.get_document(db, vendor, doc_id)
        return doc.number, sales_svc.store_pdf(db, vendor, doc)

    number, data = _run(db, work)
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{number}.pdf"'})


@router.post("/sales/{doc_id}/email")
def email_sale(doc_id: int, payload: Dict = Body(default={}), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    _require_sales(vendor)

    def work():
        doc = sales_svc.get_document(db, vendor, doc_id)
        try:
            sent_to = sales_svc.email_document(db, vendor, doc, payload.get("to"))
        except BisonBookError:
            raise
        except Exception as exc:
            raise BisonBookError(f"Email failed: {exc}")
        return {"sent_to": sent_to, "document": sales_svc.serialize_document(doc)}

    return _run(db, work)


# ---------------------------------------------------------------------------
# Books: accounts, journal, expenses, reports
# ---------------------------------------------------------------------------

@router.get("/accounts")
def accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        bal = ledger.balances(db, vendor)
        return [ledger.serialize_account(a, bal.get(a.id)) for a in ledger.accounts_list(db, vendor)]

    return _run(db, work)


@router.post("/accounts")
def create_account(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        ledger.seed_accounts(db, vendor)
        code = str(payload.get("code") or "").strip()
        name = str(payload.get("name") or "").strip()
        kind = payload.get("account_type")
        if not code.isdigit() or len(code) != 4:
            raise BisonBookError("Account codes are 4 digits, e.g. 6150.")
        if len(name) < 2:
            raise BisonBookError("Name the account.")
        if kind not in {"asset", "liability", "equity", "income", "expense"}:
            raise BisonBookError("Pick an account type.")
        if db.query(BBAccount).filter(BBAccount.vendor_id == vendor.id, BBAccount.code == code).first():
            raise BisonBookError("That account code is already used.")
        row = BBAccount(vendor_id=vendor.id, code=code, name=name, account_type=kind)
        db.add(row)
        db.flush()
        return ledger.serialize_account(row)

    return _run(db, work)


@router.get("/journal")
def journal(limit: int = Query(100, le=500), start: Optional[str] = None, end: Optional[str] = None,
            db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    s, e = _range(start, end)
    query = (
        db.query(JournalEntry)
        .options(joinedload(JournalEntry.lines).joinedload(JournalLine.account))
        .filter(JournalEntry.vendor_id == vendor.id)
    )
    if s:
        query = query.filter(JournalEntry.entry_date >= s)
    if e:
        query = query.filter(JournalEntry.entry_date <= e)
    rows = query.order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc()).limit(limit).all()
    return [ledger.serialize_entry(r) for r in rows]


@router.post("/journal")
def manual_entry(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        lines = []
        for raw in payload.get("lines") or []:
            account = ledger.account_by_id(db, vendor, int(raw.get("account_id") or 0))
            lines.append((account, float(raw.get("debit") or 0), float(raw.get("credit") or 0), raw.get("description")))
        memo = (payload.get("memo") or "").strip()
        if len(memo) < 3:
            raise BisonBookError("Describe the entry in the memo.")
        entry = ledger.post_entry(db, vendor, entry_date=payload.get("date"), memo=memo, lines=lines,
                                  source_type="manual", created_by=_actor(user))
        db.refresh(entry)
        return ledger.serialize_entry(entry)

    return _run(db, work)


@router.post("/journal/{entry_id}/reverse")
def reverse(entry_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        original = db.query(JournalEntry).filter(JournalEntry.vendor_id == vendor.id, JournalEntry.id == entry_id).first()
        if not original:
            raise BisonBookError("Entry not found.")
        if original.source_type != "manual":
            raise BisonBookError("Automatic entries are reversed by voiding the invoice, payment or expense they came from.")
        if db.query(JournalEntry).filter(JournalEntry.reversed_entry_id == entry_id).first():
            raise BisonBookError("This entry was already reversed.")
        entry = ledger.reverse_entry(db, vendor, entry_id, memo=f"Reversal of #{entry_id}: {original.memo}", created_by=_actor(user))
        db.refresh(entry)
        return ledger.serialize_entry(entry)

    return _run(db, work)


@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    rows = (
        db.query(BBExpense)
        .options(joinedload(BBExpense.account))
        .filter(BBExpense.vendor_id == vendor.id)
        .order_by(BBExpense.expense_date.desc(), BBExpense.id.desc())
        .all()
    )
    return [expense_svc.serialize_expense(r) for r in rows]


def _expense(db: Session, vendor: Vendor, expense_id: int) -> BBExpense:
    row = db.query(BBExpense).filter(BBExpense.vendor_id == vendor.id, BBExpense.id == expense_id).first()
    if not row:
        raise BisonBookError("Expense not found.")
    return row


@router.post("/expenses")
def create_expense(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: expense_svc.serialize_expense(expense_svc.create_expense(db, vendor, payload, _actor(user))))


@router.post("/expenses/{expense_id}/receipt")
async def expense_receipt(expense_id: int, file: UploadFile = File(...),
                          db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    data = await file.read()

    def work():
        row = _expense(db, vendor, expense_id)
        stored = storage.save_vendor_bytes(
            db, vendor, data, filename=file.filename or f"receipt-{expense_id}", folder="Receipts",
            mime=file.content_type, source_type="expense", source_id=row.id, replace_source=True,
        )
        row.receipt_url = stored.url
        return expense_svc.serialize_expense(row)

    return _run(db, work)


@router.post("/expenses/{expense_id}/pay")
def pay_expense(expense_id: int, payload: Dict = Body(default={}), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: expense_svc.serialize_expense(
        expense_svc.pay_expense(db, vendor, _expense(db, vendor, expense_id), payload, _actor(user))
    ))


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        expense_svc.delete_expense(db, vendor, _expense(db, vendor, expense_id), _actor(user))
        return {"deleted": True}

    return _run(db, work)


REPORTS = {"trial-balance", "profit-loss", "balance-sheet", "ar-aging", "ap-aging", "general-ledger"}


def _report_table(name: str, data: Dict) -> tuple[str, list, list]:
    if name == "trial-balance":
        rows = [[r["code"], r["name"], r["debit"], r["credit"]] for r in data["rows"]]
        rows.append(["", "Total", data["total_debit"], data["total_credit"]])
        return "Trial balance", ["Code", "Account", "Debit", "Credit"], rows
    if name == "profit-loss":
        rows = [["Income", i["name"], i["amount"]] for i in data["income"]]
        rows.append(["", "Total income", data["total_income"]])
        rows += [["Expense", e["name"], e["amount"]] for e in data["expenses"]]
        rows += [["", "Total expenses", data["total_expenses"]], ["", "Gross profit", data["gross_profit"]],
                 ["", "Net profit", data["net_profit"]]]
        return "Profit and loss", ["Section", "Account", "Amount"], rows
    if name == "balance-sheet":
        rows = [["Assets", a["name"], a["amount"]] for a in data["assets"]]
        rows.append(["", "Total assets", data["total_assets"]])
        rows += [["Liabilities", l["name"], l["amount"]] for l in data["liabilities"]]
        rows.append(["", "Total liabilities", data["total_liabilities"]])
        rows += [["Equity", q["name"], q["amount"]] for q in data["equity"]]
        rows.append(["", "Total equity", data["total_equity"]])
        return "Balance sheet", ["Section", "Account", "Amount"], rows
    if name in {"ar-aging", "ap-aging"}:
        rows = [[r["number"], r["party"], r["due_date"], r["days_overdue"], r["outstanding"]] for r in data["rows"]]
        rows.append(["", "Total", "", "", data["total"]])
        title = "Receivables aging" if name == "ar-aging" else "Payables aging"
        return title, ["Ref", "Party", "Due", "Days overdue", "Outstanding"], rows
    rows = [[r["date"], r["memo"], r["debit"], r["credit"], r["balance"]] for r in data["rows"]]
    title = f"General ledger: {data['account']['code']} {data['account']['name']}"
    return title, ["Date", "Memo", "Debit", "Credit", "Balance"], rows


@router.get("/reports/{name}")
def report(name: str, start: Optional[str] = None, end: Optional[str] = None, account_id: Optional[int] = None,
           format: str = Query("json", pattern="^(json|csv|pdf)$"),
           db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if name not in REPORTS:
        raise HTTPException(status_code=404, detail="Unknown report")
    vendor = _vendor(db, user)
    s, e = _range(start, end)

    def work():
        if name == "trial-balance":
            return ledger.trial_balance(db, vendor, e)
        if name == "profit-loss":
            return ledger.profit_and_loss(db, vendor, s, e)
        if name == "balance-sheet":
            return ledger.balance_sheet(db, vendor, e)
        if name == "ar-aging":
            return ledger.ar_aging(db, vendor, e)
        if name == "ap-aging":
            return ledger.ap_aging(db, vendor, e)
        if not account_id:
            raise BisonBookError("Choose an account for the general ledger.")
        return ledger.general_ledger(db, vendor, account_id, s, e)

    data = _run(db, work)
    if format == "json":
        return data
    title, headers, rows = _report_table(name, data)
    stem = f"{name}_{(e or date.today()).isoformat()}"
    if format == "csv":
        return Response(content=to_csv(headers, rows), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{stem}.csv"'})
    period = f"{s.isoformat() if s else 'start'} to {(e or date.today()).isoformat()}"
    pdf = table_pdf(title, f"{vendor.company_name} &middot; {period}", headers,
                    [[f"{c:,.2f}" if isinstance(c, float) else c for c in row] for row in rows])
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{stem}.pdf"'})


# ---------------------------------------------------------------------------
# Tax
# ---------------------------------------------------------------------------

@router.get("/tax/calendar")
def tax_calendar(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    return _run(db, lambda: {"vat": vat_payload(vendor), "items": tax_svc.deadline_calendar(db, vendor)})


@router.get("/tax/returns")
def tax_returns(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    rows = (
        db.query(TaxReturn)
        .filter(TaxReturn.vendor_id == vendor.id)
        .order_by(TaxReturn.period_start.desc(), TaxReturn.tax_type)
        .all()
    )
    return [tax_svc.serialize_return(r) for r in rows]


@router.post("/tax/returns/generate")
def generate_return(payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    try:
        year = int(payload.get("year"))
        month = int(payload["month"]) if payload.get("month") else None
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Pick a valid year and month.")
    return _run(db, lambda: tax_svc.serialize_return(
        tax_svc.generate_return(db, vendor, payload.get("tax_type"), year, month)
    ))


@router.post("/tax/returns/{return_id}/file")
async def file_return(return_id: int, reference: str = Form(""), receipt: Optional[UploadFile] = File(None),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    data = await receipt.read() if receipt is not None else None

    def work():
        row = db.query(TaxReturn).filter(TaxReturn.vendor_id == vendor.id, TaxReturn.id == return_id).first()
        if not row:
            raise BisonBookError("Return not found.")
        receipt_url = None
        if data:
            stored = storage.save_vendor_bytes(
                db, vendor, data, filename=receipt.filename or f"receipt-{row.id}", folder="Tax returns",
                mime=receipt.content_type, source_type="tax_receipt", source_id=row.id, replace_source=True,
            )
            receipt_url = stored.url
        return tax_svc.serialize_return(tax_svc.mark_filed(db, vendor, row, reference, receipt_url))

    return _run(db, work)


# ---------------------------------------------------------------------------
# Files (cloud storage)
# ---------------------------------------------------------------------------

@router.get("/files")
def list_files(folder: Optional[str] = None, q: Optional[str] = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    query = db.query(VendorFile).filter(VendorFile.vendor_id == vendor.id)
    if folder:
        query = query.filter(VendorFile.folder == folder)
    if q:
        query = query.filter(VendorFile.name.ilike(f"%{q.strip()}%"))
    rows = query.order_by(VendorFile.created_at.desc()).all()
    folders = sorted({r[0] for r in db.query(VendorFile.folder).filter(VendorFile.vendor_id == vendor.id).distinct()})
    return {
        "files": [storage.serialize_file(r) for r in rows],
        "folders": folders,
        "used_bytes": storage.used_bytes(db, vendor),
        "quota_bytes": storage.quota_bytes(),
    }


@router.post("/files")
async def upload_file(file: UploadFile = File(...), folder: str = Form("General"),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    data = await file.read()
    return _run(db, lambda: storage.serialize_file(storage.save_vendor_bytes(
        db, vendor, data, filename=file.filename or "file", folder=folder, mime=file.content_type, source_type="upload",
    )))


def _file(db: Session, vendor: Vendor, file_id: int) -> VendorFile:
    row = db.query(VendorFile).filter(VendorFile.vendor_id == vendor.id, VendorFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    return row


@router.patch("/files/{file_id}")
def rename_file(file_id: int, payload: Dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        row = _file(db, vendor, file_id)
        if payload.get("name"):
            row.name = storage._safe_name(payload["name"])
        if payload.get("folder"):
            row.folder = storage._safe_folder(payload["folder"])
        return storage.serialize_file(row)

    return _run(db, work)


@router.delete("/files/{file_id}")
def remove_file(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)

    def work():
        row = _file(db, vendor, file_id)
        if row.source_type == "kyc":
            raise BisonBookError("Verification documents can only be replaced from your profile, not deleted.")
        storage.delete_vendor_file(db, row)
        return {"deleted": True}

    return _run(db, work)


@router.get("/files/{file_id}/download")
def download_file(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = _vendor(db, user)
    row = _file(db, vendor, file_id)
    data = storage.read_vendor_file(row)
    if data is None:
        url = storage.file_access_url(row)
        if url.startswith("http"):
            return RedirectResponse(url)
        raise HTTPException(status_code=404, detail="File content is missing")
    return Response(content=data, media_type=row.mime or "application/octet-stream",
                    headers={"Content-Disposition": f'inline; filename="{row.name}"'})


# ---------------------------------------------------------------------------
# Superadmin: read-only view of a vendor's books
# ---------------------------------------------------------------------------

@router.get("/admin/vendors/{vendor_id}")
def admin_summary(vendor_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Superadmin only")
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    summary = _overview(db, vendor, create_reminders=False)
    summary["recent_documents"] = [
        {k: v for k, v in sales_svc.serialize_document(d).items() if k not in {"lines", "payments"}}
        for d in db.query(SalesDocument).filter(SalesDocument.vendor_id == vendor.id)
        .order_by(SalesDocument.created_at.desc()).limit(10)
    ]
    summary["tax_returns"] = [
        tax_svc.serialize_return(r)
        for r in db.query(TaxReturn).filter(TaxReturn.vendor_id == vendor.id).order_by(TaxReturn.period_start.desc()).limit(12)
    ]
    db.commit()  # seeding accounts / opening stock is harmless and keeps views consistent
    return summary
