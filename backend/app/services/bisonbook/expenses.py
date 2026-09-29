"""Expenses with receipts, input VAT and WHT withheld from suppliers."""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from ...models.bisonbook import BBExpense
from ...models.vendor import Vendor
from ..vendor_onboarding import can_charge_vat
from . import ledger
from .common import BisonBookError, money, to_date
from .storage import access_url


def serialize_expense(row: BBExpense) -> dict:
    return {
        "id": row.id,
        "expense_date": row.expense_date,
        "account_id": row.account_id,
        "account_name": row.account.name if row.account else None,
        "supplier": row.supplier,
        "description": row.description,
        "amount": money(row.amount),
        "vat_amount": money(row.vat_amount),
        "wht_amount": money(row.wht_amount),
        "total": money(row.total),
        "paid_via": row.paid_via,
        "status": row.status,
        "paid_at": row.paid_at,
        "receipt_url": access_url(row.receipt_url),
        "journal_entry_id": row.journal_entry_id,
        "created_at": row.created_at,
    }


def create_expense(db: Session, vendor: Vendor, data: dict, created_by: Optional[str]) -> BBExpense:
    account = ledger.account_by_id(db, vendor, int(data.get("account_id") or 0))
    if account.account_type != "expense":
        raise BisonBookError("Pick an expense category.")
    amount = money(data.get("amount"))
    vat = money(data.get("vat_amount"))
    wht = money(data.get("wht_amount"))
    if amount <= 0:
        raise BisonBookError("Enter the expense amount (before VAT).")
    if vat < 0 or wht < 0:
        raise BisonBookError("Tax amounts cannot be negative.")
    total = money(amount + vat)
    if wht > total:
        raise BisonBookError("WHT withheld cannot exceed the expense total.")
    paid_via = data.get("paid_via") if data.get("paid_via") in {"bank", "cash", "payable"} else "bank"
    when = to_date(data.get("expense_date"))

    row = BBExpense(
        vendor_id=vendor.id,
        expense_date=when,
        account_id=account.id,
        supplier=(data.get("supplier") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        amount=amount,
        vat_amount=vat,
        wht_amount=wht,
        total=total,
        paid_via=paid_via,
        status="unpaid" if paid_via == "payable" else "paid",
        paid_at=None if paid_via == "payable" else when,
        receipt_url=data.get("receipt_url"),
    )
    db.add(row)
    db.flush()

    # Input VAT is only recoverable for VAT-registered vendors; otherwise it is part of the cost.
    recoverable = vat if can_charge_vat(vendor) else 0.0
    label = row.supplier or row.description or account.name
    lines = [(account, money(amount + vat - recoverable), 0, label)]
    if recoverable:
        lines.append((ledger.account_by_key(db, vendor, "vat_input"), recoverable, 0, f"Input VAT: {label}"))
    if wht:
        lines.append((ledger.account_by_key(db, vendor, "wht_payable"), 0, wht, f"WHT withheld from {label}"))
    counter = ledger.account_by_key(db, vendor, {"cash": "cash", "payable": "ap"}.get(paid_via, "bank"))
    lines.append((counter, 0, money(total - wht), label))
    entry = ledger.post_entry(
        db, vendor, entry_date=when, memo=f"Expense: {label}", lines=lines,
        source_type="expense", source_id=row.id, created_by=created_by,
    )
    row.journal_entry_id = entry.id
    db.flush()
    return row


def pay_expense(db: Session, vendor: Vendor, row: BBExpense, data: dict, created_by: Optional[str]) -> BBExpense:
    if row.status != "unpaid":
        raise BisonBookError("This expense is already paid.")
    method = data.get("method") if data.get("method") in {"bank", "cash"} else "bank"
    when = to_date(data.get("paid_at"))
    due = money(row.total - (row.wht_amount or 0))
    ledger.post_entry(
        db, vendor, entry_date=when, memo=f"Paid supplier: {row.supplier or row.description or row.id}",
        lines=[
            (ledger.account_by_key(db, vendor, "ap"), due, 0, row.supplier),
            (ledger.account_by_key(db, vendor, method), 0, due, row.supplier),
        ],
        source_type="expense_payment", source_id=row.id, created_by=created_by,
    )
    row.status = "paid"
    row.paid_at = when
    db.flush()
    return row


def delete_expense(db: Session, vendor: Vendor, row: BBExpense, created_by: Optional[str]) -> None:
    if row.status == "paid" and row.paid_via == "payable":
        raise BisonBookError("This supplier bill has been paid. Record a refund instead of deleting.")
    ledger.reverse_entry(db, vendor, row.journal_entry_id, when=date.today(),
                         memo=f"Deleted expense #{row.id}", created_by=created_by)
    db.delete(row)
