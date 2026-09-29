"""Quotes, invoices, payments. VAT is decided server-side from the vendor's VAT approval."""
from __future__ import annotations

import io
import smtplib
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from ...core.config import settings
from ...models.bisonbook import BBCustomer, BBPayment, SalesDocument, SalesLine
from ...models.vendor import Vendor
from ..vendor_onboarding import can_charge_vat, effective_vat_rate
from . import inventory, ledger
from .common import BisonBookError, get_settings, money, naira, to_date
from .storage import access_url, save_vendor_bytes

QUOTE_STATUSES = {"draft", "sent", "accepted", "declined", "converted"}
INVOICE_STATUSES = {"draft", "issued", "partially_paid", "paid", "void"}


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

def serialize_customer(row: BBCustomer) -> dict:
    return {"id": row.id, "name": row.name, "email": row.email, "phone": row.phone,
            "address": row.address, "tin": row.tin, "created_at": row.created_at}


def upsert_customer(db: Session, vendor: Vendor, data: dict, customer_id: Optional[int] = None) -> BBCustomer:
    name = (data.get("name") or "").strip()
    if len(name) < 2:
        raise BisonBookError("Enter the customer's name.")
    if customer_id:
        row = db.query(BBCustomer).filter(BBCustomer.vendor_id == vendor.id, BBCustomer.id == customer_id).first()
        if not row:
            raise BisonBookError("Customer not found.")
    else:
        row = BBCustomer(vendor_id=vendor.id)
        db.add(row)
    row.name = name
    for key in ("email", "phone", "address", "tin"):
        value = data.get(key)
        setattr(row, key, (value or "").strip() or None)
    db.flush()
    return row


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def get_document(db: Session, vendor: Vendor, doc_id: int) -> SalesDocument:
    doc = (
        db.query(SalesDocument)
        .options(joinedload(SalesDocument.lines), joinedload(SalesDocument.payments))
        .filter(SalesDocument.vendor_id == vendor.id, SalesDocument.id == doc_id)
        .first()
    )
    if not doc:
        raise BisonBookError("Document not found.")
    return doc


def _next_number(db: Session, vendor: Vendor, kind: str) -> str:
    cfg = get_settings(db, vendor)
    if kind == "quote":
        n = cfg.next_quote_number or 1
        cfg.next_quote_number = n + 1
        return f"QT-{n:04d}"
    n = cfg.next_invoice_number or 1
    cfg.next_invoice_number = n + 1
    return f"INV-{n:04d}"


def _apply_lines(db: Session, vendor: Vendor, doc: SalesDocument, lines: List[dict]) -> None:
    if not lines:
        raise BisonBookError("Add at least one line item.")
    doc.lines.clear()
    db.flush()
    for raw in lines:
        listing_id = raw.get("vendor_product_id")
        description = (raw.get("description") or "").strip()
        if listing_id:
            listing = inventory.listing_for_vendor(db, vendor, int(listing_id))
            if not description:
                description = listing.product.name if listing.product else f"Item {listing.id}"
        if not description:
            raise BisonBookError("Every line needs a description.")
        qty = float(raw.get("quantity") or 0)
        price = float(raw.get("unit_price") or 0)
        if qty <= 0:
            raise BisonBookError("Quantities must be greater than zero.")
        if price < 0:
            raise BisonBookError("Prices cannot be negative.")
        if listing_id and float(qty) != int(qty):
            raise BisonBookError("Stocked products must be sold in whole units.")
        doc.lines.append(SalesLine(
            vendor_product_id=int(listing_id) if listing_id else None,
            description=description[:250],
            quantity=qty,
            unit_price=money(price),
            line_total=money(qty * price),
        ))
    _recalculate(doc, vendor)


def _recalculate(doc: SalesDocument, vendor: Vendor) -> None:
    doc.subtotal = money(sum(line.line_total for line in doc.lines))
    doc.vat_amount = money(doc.subtotal * (doc.vat_rate or 0) / 100)
    doc.total = money(doc.subtotal + doc.vat_amount)


def _apply_customer(db: Session, vendor: Vendor, doc: SalesDocument, data: dict) -> None:
    customer_id = data.get("customer_id")
    if customer_id:
        customer = db.query(BBCustomer).filter(BBCustomer.vendor_id == vendor.id, BBCustomer.id == customer_id).first()
        if not customer:
            raise BisonBookError("Customer not found.")
        doc.customer_id = customer.id
        doc.customer_name = customer.name
        doc.customer_email = customer.email
        doc.customer_phone = customer.phone
        doc.customer_address = customer.address
        doc.customer_tin = customer.tin
        return
    name = (data.get("customer_name") or "").strip()
    if len(name) < 2:
        raise BisonBookError("Choose a customer or enter the customer's name.")
    if data.get("save_customer"):
        customer = upsert_customer(db, vendor, {
            "name": name, "email": data.get("customer_email"), "phone": data.get("customer_phone"),
            "address": data.get("customer_address"), "tin": data.get("customer_tin"),
        })
        doc.customer_id = customer.id
    doc.customer_name = name
    doc.customer_email = (data.get("customer_email") or "").strip() or None
    doc.customer_phone = (data.get("customer_phone") or "").strip() or None
    doc.customer_address = (data.get("customer_address") or "").strip() or None
    doc.customer_tin = (data.get("customer_tin") or "").strip() or None


def create_document(db: Session, vendor: Vendor, kind: str, data: dict) -> SalesDocument:
    if kind not in {"quote", "invoice"}:
        raise BisonBookError("Kind must be quote or invoice.")
    cfg = get_settings(db, vendor)
    issue = to_date(data.get("issue_date"))
    doc = SalesDocument(
        vendor_id=vendor.id,
        kind=kind,
        number=_next_number(db, vendor, kind),
        status="draft",
        issue_date=issue,
        due_date=to_date(data["due_date"]) if data.get("due_date") else issue + timedelta(
            days=int(cfg.quote_valid_days if kind == "quote" else cfg.payment_terms_days) or 0
        ),
        notes=(data.get("notes") or "").strip() or None,
        vat_rate=effective_vat_rate(vendor),
    )
    _apply_customer(db, vendor, doc, data)
    db.add(doc)
    db.flush()
    _apply_lines(db, vendor, doc, data.get("lines") or [])
    db.flush()
    return doc


def update_document(db: Session, vendor: Vendor, doc: SalesDocument, data: dict) -> SalesDocument:
    if doc.status != "draft" and not (doc.kind == "quote" and doc.status == "sent"):
        raise BisonBookError("Only drafts can be edited. Void and re-issue instead.")
    if data.get("issue_date"):
        doc.issue_date = to_date(data["issue_date"])
    if data.get("due_date"):
        doc.due_date = to_date(data["due_date"])
    if "notes" in data:
        doc.notes = (data.get("notes") or "").strip() or None
    if data.get("customer_id") or data.get("customer_name"):
        _apply_customer(db, vendor, doc, data)
    doc.vat_rate = effective_vat_rate(vendor)
    if data.get("lines") is not None:
        _apply_lines(db, vendor, doc, data["lines"])
    else:
        _recalculate(doc, vendor)
    db.flush()
    return doc


def delete_draft(db: Session, vendor: Vendor, doc: SalesDocument) -> None:
    if doc.status != "draft":
        raise BisonBookError("Only drafts can be deleted. Void issued invoices instead.")
    db.delete(doc)


def issue_invoice(db: Session, vendor: Vendor, doc: SalesDocument, created_by: Optional[str]) -> SalesDocument:
    if doc.kind != "invoice":
        raise BisonBookError("Only invoices can be issued.")
    if doc.status != "draft":
        raise BisonBookError("This invoice has already been issued.")
    # Freeze VAT at issue time using the vendor's current approval.
    doc.vat_rate = effective_vat_rate(vendor)
    _recalculate(doc, vendor)
    for line in doc.lines:
        if line.vendor_product_id:
            listing = inventory.listing_for_vendor(db, vendor, line.vendor_product_id)
            inventory.ensure_opening_movements(db, vendor)
            if int(listing.stock_quantity or 0) < int(line.quantity):
                name = listing.product.name if listing.product else line.description
                raise BisonBookError(f"Not enough stock for {name}: {listing.stock_quantity} available.")
    lines = [
        (ledger.account_by_key(db, vendor, "ar"), doc.total, 0, doc.customer_name),
        (ledger.account_by_key(db, vendor, "sales"), 0, doc.subtotal, f"Sales {doc.number}"),
    ]
    if doc.vat_amount:
        lines.append((ledger.account_by_key(db, vendor, "vat_output"), 0, doc.vat_amount, f"VAT {doc.vat_rate}% on {doc.number}"))
    entry = ledger.post_entry(
        db, vendor, entry_date=doc.issue_date, memo=f"Invoice {doc.number} to {doc.customer_name}",
        lines=lines, source_type="invoice", source_id=doc.id, created_by=created_by,
    )
    doc.journal_entry_id = entry.id
    doc.status = "issued"
    doc.issued_at = datetime.utcnow()
    db.flush()
    return doc


def _post_stock_out(db: Session, vendor: Vendor, doc: SalesDocument, created_by: Optional[str]) -> None:
    if doc.stock_posted:
        return
    cogs_total = 0.0
    for line in doc.lines:
        if not line.vendor_product_id:
            continue
        listing = inventory.listing_for_vendor(db, vendor, line.vendor_product_id)
        qty = int(line.quantity)
        available = int(listing.stock_quantity or 0)
        take = min(qty, max(available, 0))
        if take <= 0:
            continue
        move = inventory.record_movement(
            db, vendor, listing, movement_type="sale", quantity=-take,
            reference=doc.number, note=f"Sold to {doc.customer_name}", created_by=created_by,
        )
        cogs_total += take * (move.unit_cost or 0)
    cogs_total = money(cogs_total)
    if cogs_total > 0:
        ledger.post_entry(
            db, vendor, entry_date=date.today(), memo=f"Cost of goods sold for {doc.number}",
            lines=[
                (ledger.account_by_key(db, vendor, "cogs"), cogs_total, 0, doc.number),
                (ledger.account_by_key(db, vendor, "inventory"), 0, cogs_total, doc.number),
            ],
            source_type="stock", source_id=doc.id, created_by=created_by,
        )
    doc.stock_posted = True


def record_payment(db: Session, vendor: Vendor, doc: SalesDocument, data: dict, created_by: Optional[str]) -> BBPayment:
    if doc.kind != "invoice" or doc.status not in {"issued", "partially_paid"}:
        raise BisonBookError("Payments can only be recorded against issued invoices.")
    amount = money(data.get("amount"))
    wht = money(data.get("wht_amount"))
    outstanding = money(doc.total - (doc.amount_paid or 0))
    if amount <= 0:
        raise BisonBookError("Enter the amount settled.")
    if wht < 0 or wht > amount:
        raise BisonBookError("WHT deducted must be between zero and the amount settled.")
    if amount - outstanding > 0.005:
        raise BisonBookError(f"That is more than the {naira(outstanding)} outstanding.")
    method = data.get("method") if data.get("method") in {"bank", "cash"} else "bank"
    paid_at = to_date(data.get("paid_at"))
    payment = BBPayment(
        vendor_id=vendor.id, document_id=doc.id, amount=amount, wht_amount=wht, method=method,
        reference=(data.get("reference") or "").strip() or None, paid_at=paid_at,
    )
    doc.payments.append(payment)
    db.flush()
    lines = [(ledger.account_by_key(db, vendor, method), money(amount - wht), 0, payment.reference or doc.number)]
    if wht:
        lines.append((ledger.account_by_key(db, vendor, "wht_receivable"), wht, 0, f"WHT deducted by {doc.customer_name}"))
    lines.append((ledger.account_by_key(db, vendor, "ar"), 0, amount, doc.number))
    entry = ledger.post_entry(
        db, vendor, entry_date=paid_at, memo=f"Payment for {doc.number}", lines=lines,
        source_type="payment", source_id=payment.id, created_by=created_by,
    )
    payment.journal_entry_id = entry.id
    doc.amount_paid = money((doc.amount_paid or 0) + amount)
    if doc.total - doc.amount_paid <= 0.005:
        doc.status = "paid"
        _post_stock_out(db, vendor, doc, created_by)
    else:
        doc.status = "partially_paid"
    db.flush()
    return payment


def void_invoice(db: Session, vendor: Vendor, doc: SalesDocument, created_by: Optional[str]) -> SalesDocument:
    if doc.kind != "invoice" or doc.status not in {"issued", "partially_paid"}:
        raise BisonBookError("Only issued, unpaid invoices can be voided.")
    if doc.payments:
        raise BisonBookError("This invoice has payments. Refund them before voiding.")
    ledger.reverse_entry(db, vendor, doc.journal_entry_id, memo=f"Void {doc.number}", created_by=created_by)
    doc.status = "void"
    db.flush()
    return doc


def set_quote_status(db: Session, vendor: Vendor, doc: SalesDocument, status: str) -> SalesDocument:
    if doc.kind != "quote":
        raise BisonBookError("Not a quote.")
    if status not in {"sent", "accepted", "declined"}:
        raise BisonBookError("Status must be sent, accepted or declined.")
    if doc.status == "converted":
        raise BisonBookError("This quote was already converted to an invoice.")
    doc.status = status
    db.flush()
    return doc


def convert_quote(db: Session, vendor: Vendor, quote: SalesDocument) -> SalesDocument:
    if quote.kind != "quote":
        raise BisonBookError("Not a quote.")
    if quote.status in {"converted", "declined"}:
        raise BisonBookError(f"A {quote.status} quote cannot be converted.")
    invoice = create_document(db, vendor, "invoice", {
        "customer_id": quote.customer_id,
        "customer_name": quote.customer_name,
        "customer_email": quote.customer_email,
        "customer_phone": quote.customer_phone,
        "customer_address": quote.customer_address,
        "customer_tin": quote.customer_tin,
        "notes": quote.notes,
        "lines": [
            {"vendor_product_id": l.vendor_product_id, "description": l.description,
             "quantity": l.quantity, "unit_price": l.unit_price}
            for l in quote.lines
        ],
    })
    invoice.source_quote_id = quote.id
    quote.status = "converted"
    db.flush()
    return invoice


def serialize_document(doc: SalesDocument) -> dict:
    return {
        "id": doc.id,
        "kind": doc.kind,
        "number": doc.number,
        "status": doc.status,
        "issue_date": doc.issue_date,
        "due_date": doc.due_date,
        "customer_id": doc.customer_id,
        "customer_name": doc.customer_name,
        "customer_email": doc.customer_email,
        "customer_phone": doc.customer_phone,
        "customer_address": doc.customer_address,
        "customer_tin": doc.customer_tin,
        "vat_rate": doc.vat_rate or 0,
        "subtotal": money(doc.subtotal),
        "vat_amount": money(doc.vat_amount),
        "total": money(doc.total),
        "amount_paid": money(doc.amount_paid),
        "balance_due": money((doc.total or 0) - (doc.amount_paid or 0)) if doc.kind == "invoice" else None,
        "notes": doc.notes,
        "source_quote_id": doc.source_quote_id,
        "pdf_url": access_url(doc.pdf_url),
        "issued_at": doc.issued_at,
        "created_at": doc.created_at,
        "lines": [
            {"id": l.id, "vendor_product_id": l.vendor_product_id, "description": l.description,
             "quantity": l.quantity, "unit_price": money(l.unit_price), "line_total": money(l.line_total)}
            for l in doc.lines
        ],
        "payments": [
            {"id": p.id, "amount": money(p.amount), "wht_amount": money(p.wht_amount), "method": p.method,
             "reference": p.reference, "paid_at": p.paid_at}
            for p in doc.payments
        ],
    }


# ---------------------------------------------------------------------------
# PDF + email
# ---------------------------------------------------------------------------

def render_pdf(vendor: Vendor, doc: SalesDocument) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=0.7 * inch, rightMargin=0.7 * inch)
    styles = getSampleStyleSheet()
    title = "QUOTATION" if doc.kind == "quote" else ("TAX INVOICE" if doc.vat_amount else "INVOICE")
    story = [Paragraph(f"<b>{vendor.company_name}</b>", styles["Heading2"])]
    vendor_bits = [vendor.business_address or vendor.address, vendor.phone]
    if vendor.tin:
        vendor_bits.append(f"TIN: {vendor.tin}")
    vendor_bits.append("VAT registered" if can_charge_vat(vendor) else "Not VAT registered")
    story.append(Paragraph("<br/>".join(b for b in vendor_bits if b), styles["Normal"]))
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(title, styles["Title"]))
    date_label = "Valid until" if doc.kind == "quote" else "Due date"
    meta = [
        ["Number", doc.number, "Date", doc.issue_date.strftime("%d %b %Y")],
        ["Status", doc.status.replace("_", " ").title(), date_label, doc.due_date.strftime("%d %b %Y") if doc.due_date else "-"],
    ]
    meta_table = Table(meta, colWidths=[1 * inch, 2.2 * inch, 1 * inch, 2.2 * inch])
    meta_table.setStyle(TableStyle([("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                                    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                                    ("FONTSIZE", (0, 0), (-1, -1), 9)]))
    story.append(meta_table)
    story.append(Spacer(1, 0.2 * inch))
    bill = [doc.customer_name, doc.customer_address, doc.customer_email, doc.customer_phone,
            f"TIN: {doc.customer_tin}" if doc.customer_tin else None]
    story.append(Paragraph("<b>Bill to</b><br/>" + "<br/>".join(b for b in bill if b), styles["Normal"]))
    story.append(Spacer(1, 0.2 * inch))

    data = [["Description", "Qty", "Unit price", "Amount"]]
    for line in doc.lines:
        qty = int(line.quantity) if float(line.quantity).is_integer() else line.quantity
        data.append([Paragraph(line.description, styles["Normal"]), str(qty), naira(line.unit_price), naira(line.line_total)])
    data.append(["", "", "Subtotal", naira(doc.subtotal)])
    data.append(["", "", f"VAT ({doc.vat_rate:g}%)" if doc.vat_rate else "VAT (not registered)", naira(doc.vat_amount)])
    data.append(["", "", "Total", naira(doc.total)])
    if doc.kind == "invoice" and doc.amount_paid:
        data.append(["", "", "Paid", naira(doc.amount_paid)])
        data.append(["", "", "Balance due", naira(doc.total - doc.amount_paid)])
    table = Table(data, colWidths=[3.3 * inch, 0.6 * inch, 1.3 * inch, 1.4 * inch], repeatRows=1)
    n = len(doc.lines)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#171717")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, n), 0.4, colors.HexColor("#cccccc")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (2, n + 3), (-1, n + 3), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(table)
    if doc.notes:
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph(f"<b>Notes</b><br/>{doc.notes}", styles["Normal"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph("<font size=8 color='#888888'>Generated with BisonBook on ProcureX.</font>", styles["Normal"]))
    pdf.build(story)
    return buffer.getvalue()


def store_pdf(db: Session, vendor: Vendor, doc: SalesDocument) -> bytes:
    data = render_pdf(vendor, doc)
    folder = "Quotes" if doc.kind == "quote" else "Invoices"
    row = save_vendor_bytes(
        db, vendor, data, filename=f"{doc.number}.pdf", folder=folder, mime="application/pdf",
        source_type=doc.kind, source_id=doc.id, replace_source=True,
    )
    doc.pdf_url = row.url
    return data


def email_document(db: Session, vendor: Vendor, doc: SalesDocument, to: Optional[str] = None) -> str:
    recipient = (to or doc.customer_email or "").strip()
    if not recipient:
        raise BisonBookError("Add the customer's email address first.")
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise BisonBookError("Email is not configured on this server yet. Download the PDF and send it yourself.")
    data = store_pdf(db, vendor, doc)
    label = "Quotation" if doc.kind == "quote" else "Invoice"
    msg = EmailMessage()
    msg["Subject"] = f"{label} {doc.number} from {vendor.company_name}"
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = recipient
    msg.set_content("\n".join([
        f"Dear {doc.customer_name},",
        "",
        f"Please find attached {label.lower()} {doc.number} for {naira(doc.total)}.",
        "",
        f"Regards,\n{vendor.company_name}",
    ]))
    msg.add_attachment(data, maintype="application", subtype="pdf", filename=f"{doc.number}.pdf")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        try:
            server.starttls()
            server.ehlo()
        except Exception:
            pass
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
    if doc.kind == "quote" and doc.status == "draft":
        doc.status = "sent"
    return recipient
