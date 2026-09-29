"""Double-entry ledger, chart of accounts, and financial reports."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session, joinedload

from ...models.bisonbook import BBAccount, BBExpense, JournalEntry, JournalLine, SalesDocument
from ...models.vendor import Vendor
from .common import BisonBookError, ensure_open_period, money, to_date

# code, name, type, system_key
DEFAULT_ACCOUNTS: Sequence[Tuple[str, str, str, Optional[str]]] = (
    ("1000", "Cash on hand", "asset", "cash"),
    ("1010", "Bank", "asset", "bank"),
    ("1100", "Accounts receivable", "asset", "ar"),
    ("1200", "Inventory", "asset", "inventory"),
    ("1300", "VAT input (recoverable)", "asset", "vat_input"),
    ("1310", "WHT receivable (tax credit)", "asset", "wht_receivable"),
    ("2000", "Accounts payable", "liability", "ap"),
    ("2100", "VAT output (payable)", "liability", "vat_output"),
    ("2200", "WHT payable", "liability", "wht_payable"),
    ("2300", "Company income tax payable", "liability", "cit_payable"),
    ("3000", "Owner's equity", "equity", "equity"),
    ("3100", "Opening balance equity", "equity", "opening_equity"),
    ("3200", "Retained earnings", "equity", "retained"),
    ("4000", "Sales", "income", "sales"),
    ("4100", "Other income", "income", "other_income"),
    ("5000", "Cost of goods sold", "expense", "cogs"),
    ("6000", "General expenses", "expense", "expense_general"),
    ("6100", "Rent", "expense", None),
    ("6200", "Salaries and wages", "expense", None),
    ("6300", "Utilities (power, internet)", "expense", None),
    ("6400", "Transport and logistics", "expense", None),
    ("6500", "Marketing", "expense", None),
    ("6600", "Bank charges", "expense", None),
    ("6700", "Inventory shrinkage", "expense", "shrinkage"),
    ("6800", "Professional fees", "expense", None),
)

DEBIT_NORMAL = {"asset", "expense"}


def seed_accounts(db: Session, vendor: Vendor) -> None:
    existing = {row.code for row in db.query(BBAccount.code).filter(BBAccount.vendor_id == vendor.id)}
    added = False
    for code, name, kind, key in DEFAULT_ACCOUNTS:
        if code in existing:
            continue
        db.add(BBAccount(vendor_id=vendor.id, code=code, name=name, account_type=kind, system_key=key, is_system=True))
        added = True
    if added:
        db.flush()


def account_by_key(db: Session, vendor: Vendor, key: str) -> BBAccount:
    row = db.query(BBAccount).filter(BBAccount.vendor_id == vendor.id, BBAccount.system_key == key).first()
    if row:
        return row
    seed_accounts(db, vendor)
    row = db.query(BBAccount).filter(BBAccount.vendor_id == vendor.id, BBAccount.system_key == key).first()
    if not row:
        raise BisonBookError(f"Missing system account {key}.")
    return row


def account_by_id(db: Session, vendor: Vendor, account_id: int) -> BBAccount:
    row = db.query(BBAccount).filter(BBAccount.vendor_id == vendor.id, BBAccount.id == account_id).first()
    if not row:
        raise BisonBookError("Account not found.")
    return row


Line = Tuple[BBAccount, float, float, Optional[str]]  # account, debit, credit, description


def post_entry(
    db: Session,
    vendor: Vendor,
    *,
    entry_date,
    memo: str,
    lines: Iterable[Line],
    source_type: str,
    source_id: Optional[int] = None,
    created_by: Optional[str] = None,
) -> JournalEntry:
    when = to_date(entry_date)
    ensure_open_period(db, vendor, when)
    clean = [(acct, money(dr), money(cr), desc) for acct, dr, cr, desc in lines if money(dr) or money(cr)]
    if len(clean) < 2:
        raise BisonBookError("A journal entry needs at least two lines.")
    for acct, dr, cr, _ in clean:
        if dr < 0 or cr < 0:
            raise BisonBookError("Debits and credits must be positive.")
        if acct.vendor_id != vendor.id:
            raise BisonBookError("Account does not belong to this business.")
    debits = money(sum(dr for _, dr, _, _ in clean))
    credits = money(sum(cr for _, _, cr, _ in clean))
    if abs(debits - credits) > 0.005:
        raise BisonBookError(f"Entry does not balance: debits {debits:,.2f} vs credits {credits:,.2f}.")
    entry = JournalEntry(
        vendor_id=vendor.id,
        entry_date=when,
        memo=memo,
        source_type=source_type,
        source_id=source_id,
        created_by=created_by,
    )
    for acct, dr, cr, desc in clean:
        entry.lines.append(JournalLine(account_id=acct.id, debit=dr, credit=cr, description=desc))
    db.add(entry)
    db.flush()
    return entry


def reverse_entry(db: Session, vendor: Vendor, entry_id: Optional[int], *, when=None, memo: str, created_by=None) -> Optional[JournalEntry]:
    if not entry_id:
        return None
    original = (
        db.query(JournalEntry)
        .options(joinedload(JournalEntry.lines).joinedload(JournalLine.account))
        .filter(JournalEntry.vendor_id == vendor.id, JournalEntry.id == entry_id)
        .first()
    )
    if not original:
        return None
    reversal = post_entry(
        db,
        vendor,
        entry_date=when or date.today(),
        memo=memo,
        lines=[(line.account, line.credit, line.debit, line.description) for line in original.lines],
        source_type="reversal",
        source_id=original.id,
        created_by=created_by,
    )
    reversal.reversed_entry_id = original.id
    return reversal


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def _line_query(db: Session, vendor: Vendor, start: Optional[date], end: Optional[date]):
    query = (
        db.query(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .filter(JournalEntry.vendor_id == vendor.id)
    )
    if start:
        query = query.filter(JournalEntry.entry_date >= start)
    if end:
        query = query.filter(JournalEntry.entry_date <= end)
    return query


def balances(db: Session, vendor: Vendor, start: Optional[date] = None, end: Optional[date] = None) -> Dict[int, Tuple[float, float]]:
    totals: Dict[int, List[float]] = defaultdict(lambda: [0.0, 0.0])
    for line, _entry in _line_query(db, vendor, start, end):
        totals[line.account_id][0] += line.debit or 0
        totals[line.account_id][1] += line.credit or 0
    return {key: (money(dr), money(cr)) for key, (dr, cr) in totals.items()}


def natural_balance(account: BBAccount, debit: float, credit: float) -> float:
    return money(debit - credit) if account.account_type in DEBIT_NORMAL else money(credit - debit)


def accounts_list(db: Session, vendor: Vendor) -> List[BBAccount]:
    seed_accounts(db, vendor)
    return db.query(BBAccount).filter(BBAccount.vendor_id == vendor.id).order_by(BBAccount.code).all()


def serialize_account(account: BBAccount, bal: Optional[Tuple[float, float]] = None) -> dict:
    dr, cr = bal or (0.0, 0.0)
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "account_type": account.account_type,
        "system_key": account.system_key,
        "is_system": bool(account.is_system),
        "is_active": bool(account.is_active),
        "balance": natural_balance(account, dr, cr),
    }


def trial_balance(db: Session, vendor: Vendor, end: Optional[date] = None) -> dict:
    bal = balances(db, vendor, None, end)
    rows = []
    total_dr = total_cr = 0.0
    for account in accounts_list(db, vendor):
        dr, cr = bal.get(account.id, (0.0, 0.0))
        net = money(dr - cr)
        if not dr and not cr:
            continue
        row_dr = net if net > 0 else 0.0
        row_cr = -net if net < 0 else 0.0
        total_dr += row_dr
        total_cr += row_cr
        rows.append({"code": account.code, "name": account.name, "account_type": account.account_type,
                     "debit": money(row_dr), "credit": money(row_cr)})
    return {"as_of": end, "rows": rows, "total_debit": money(total_dr), "total_credit": money(total_cr),
            "balanced": abs(total_dr - total_cr) < 0.01}


def profit_and_loss(db: Session, vendor: Vendor, start: Optional[date], end: Optional[date]) -> dict:
    bal = balances(db, vendor, start, end)
    income, expenses = [], []
    for account in accounts_list(db, vendor):
        if account.account_type not in {"income", "expense"}:
            continue
        dr, cr = bal.get(account.id, (0.0, 0.0))
        amount = natural_balance(account, dr, cr)
        if not amount:
            continue
        item = {"code": account.code, "name": account.name, "amount": amount, "system_key": account.system_key}
        (income if account.account_type == "income" else expenses).append(item)
    total_income = money(sum(i["amount"] for i in income))
    cogs = money(sum(e["amount"] for e in expenses if e["system_key"] == "cogs"))
    total_expenses = money(sum(e["amount"] for e in expenses))
    return {
        "start": start,
        "end": end,
        "income": income,
        "expenses": expenses,
        "total_income": total_income,
        "cost_of_sales": cogs,
        "gross_profit": money(total_income - cogs),
        "total_expenses": total_expenses,
        "net_profit": money(total_income - total_expenses),
    }


def balance_sheet(db: Session, vendor: Vendor, end: Optional[date]) -> dict:
    bal = balances(db, vendor, None, end)
    sections: Dict[str, List[dict]] = {"asset": [], "liability": [], "equity": []}
    earnings = 0.0
    for account in accounts_list(db, vendor):
        dr, cr = bal.get(account.id, (0.0, 0.0))
        amount = natural_balance(account, dr, cr)
        if account.account_type in sections:
            if amount:
                sections[account.account_type].append({"code": account.code, "name": account.name, "amount": amount})
        elif account.account_type == "income":
            earnings += amount
        else:
            earnings -= amount
    earnings = money(earnings)
    if earnings:
        sections["equity"].append({"code": "", "name": "Current earnings", "amount": earnings})
    total_assets = money(sum(i["amount"] for i in sections["asset"]))
    total_liabilities = money(sum(i["amount"] for i in sections["liability"]))
    total_equity = money(sum(i["amount"] for i in sections["equity"]))
    return {
        "as_of": end,
        "assets": sections["asset"],
        "liabilities": sections["liability"],
        "equity": sections["equity"],
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_equity": total_equity,
        "balanced": abs(total_assets - total_liabilities - total_equity) < 0.01,
    }


def general_ledger(db: Session, vendor: Vendor, account_id: int, start: Optional[date], end: Optional[date]) -> dict:
    account = account_by_id(db, vendor, account_id)
    opening = 0.0
    if start:
        before = balances(db, vendor, None, date.fromordinal(start.toordinal() - 1)).get(account.id, (0.0, 0.0))
        opening = natural_balance(account, *before)
    rows = []
    running = opening
    query = (
        _line_query(db, vendor, start, end)
        .filter(JournalLine.account_id == account.id)
        .order_by(JournalEntry.entry_date, JournalEntry.id, JournalLine.id)
    )
    for line, entry in query:
        delta = natural_balance(account, line.debit or 0, line.credit or 0)
        running = money(running + delta)
        rows.append({
            "entry_id": entry.id,
            "date": entry.entry_date,
            "memo": entry.memo,
            "description": line.description,
            "source_type": entry.source_type,
            "debit": money(line.debit),
            "credit": money(line.credit),
            "balance": running,
        })
    return {"account": serialize_account(account), "opening_balance": money(opening), "rows": rows, "closing_balance": running}


def _aging_bucket(days: int) -> str:
    if days <= 0:
        return "current"
    if days <= 30:
        return "1_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "over_90"


def ar_aging(db: Session, vendor: Vendor, as_of: Optional[date] = None) -> dict:
    today = as_of or date.today()
    buckets = {k: 0.0 for k in ("current", "1_30", "31_60", "61_90", "over_90")}
    rows = []
    docs = (
        db.query(SalesDocument)
        .filter(
            SalesDocument.vendor_id == vendor.id,
            SalesDocument.kind == "invoice",
            SalesDocument.status.in_(["issued", "partially_paid"]),
        )
        .all()
    )
    for doc in docs:
        outstanding = money((doc.total or 0) - (doc.amount_paid or 0))
        if outstanding <= 0:
            continue
        days = (today - (doc.due_date or doc.issue_date)).days
        bucket = _aging_bucket(days)
        buckets[bucket] = money(buckets[bucket] + outstanding)
        rows.append({"id": doc.id, "number": doc.number, "party": doc.customer_name, "due_date": doc.due_date,
                     "days_overdue": max(days, 0), "bucket": bucket, "outstanding": outstanding})
    rows.sort(key=lambda r: -r["days_overdue"])
    return {"as_of": today, "buckets": buckets, "rows": rows, "total": money(sum(buckets.values()))}


def ap_aging(db: Session, vendor: Vendor, as_of: Optional[date] = None) -> dict:
    today = as_of or date.today()
    buckets = {k: 0.0 for k in ("current", "1_30", "31_60", "61_90", "over_90")}
    rows = []
    for exp in db.query(BBExpense).filter(BBExpense.vendor_id == vendor.id, BBExpense.status == "unpaid").all():
        outstanding = money((exp.total or 0) - (exp.wht_amount or 0))
        days = (today - exp.expense_date).days - 30  # supplier terms: 30 days
        bucket = _aging_bucket(days)
        buckets[bucket] = money(buckets[bucket] + outstanding)
        rows.append({"id": exp.id, "number": f"EXP-{exp.id:04d}", "party": exp.supplier or exp.description,
                     "due_date": date.fromordinal(exp.expense_date.toordinal() + 30),
                     "days_overdue": max(days, 0), "bucket": bucket, "outstanding": outstanding})
    rows.sort(key=lambda r: -r["days_overdue"])
    return {"as_of": today, "buckets": buckets, "rows": rows, "total": money(sum(buckets.values()))}


def serialize_entry(entry: JournalEntry) -> dict:
    return {
        "id": entry.id,
        "date": entry.entry_date,
        "memo": entry.memo,
        "source_type": entry.source_type,
        "source_id": entry.source_id,
        "reversed_entry_id": entry.reversed_entry_id,
        "created_by": entry.created_by,
        "lines": [
            {
                "account_id": line.account_id,
                "account_code": line.account.code if line.account else None,
                "account_name": line.account.name if line.account else None,
                "debit": money(line.debit),
                "credit": money(line.credit),
                "description": line.description,
            }
            for line in entry.lines
        ],
        "total": money(sum(line.debit or 0 for line in entry.lines)),
    }
