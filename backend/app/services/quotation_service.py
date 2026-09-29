import os
from typing import List, Optional
from decimal import Decimal
from datetime import datetime, timedelta
import smtplib
from email.message import EmailMessage
from sqlalchemy.orm import Session, joinedload, object_session
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable, KeepTogether
from reportlab.lib import colors
from fastapi import HTTPException
from ..models.quotation import Quotation, QuotationItem
from ..models.product import Product, VendorProduct
from ..models.vendor import Vendor
from ..models.business import BuyerBusiness, BusinessClient, ClientRequest
from ..schemas.quotation import QuotationCreate, QuotationItemCreate, QuotationUpdate
from ..core.config import settings
from .business_service import get_business


QUOTE_COVER_NOTE = "Please find the attached quotation for your kind review."
INVOICE_COVER_NOTE = "Please find the attached invoice."
RECEIPT_COVER_NOTE = "Please find the attached receipt. Thank you for your payment."
DOCUMENT_KINDS = {
    "quote": {"title": "QUOTATION", "prefix": "QT", "noun": "quotation", "cover": QUOTE_COVER_NOTE},
    "invoice": {"title": "INVOICE", "prefix": "INV", "noun": "invoice", "cover": INVOICE_COVER_NOTE},
    "receipt": {"title": "RECEIPT", "prefix": "RCT", "noun": "receipt", "cover": RECEIPT_COVER_NOTE},
}
DEFAULT_COVERS = {meta["cover"] for meta in DOCUMENT_KINDS.values()}


def quotation_kind(quotation: Optional[Quotation] = None, kind: Optional[str] = None) -> str:
    value = kind if kind is not None else getattr(quotation, "document_kind", None)
    text = str(value or "quote").lower().strip()
    return text if text in DOCUMENT_KINDS else "quote"


def quotation_meta(quotation: Optional[Quotation] = None, kind: Optional[str] = None) -> dict:
    return DOCUMENT_KINDS[quotation_kind(quotation, kind)]


def quote_cover_note(notes: Optional[str], kind: str = "quote") -> str:
    text = (notes or "").strip()
    if not text or text.lower().startswith("issued from procurex chat"):
        return quotation_meta(kind=kind)["cover"]
    return text


def cover_for_kind(notes: Optional[str], kind: str) -> str:
    text = (notes or "").strip()
    if not text or text.lower().startswith("issued from procurex chat") or text in DEFAULT_COVERS:
        return quotation_meta(kind=kind)["cover"]
    return text


def _vat_percent(value) -> Decimal:
    try:
        pct = Decimal(str(value if value is not None else settings.VAT_RATE))
    except Exception:
        pct = Decimal(str(settings.VAT_RATE))
    if pct < 0:
        return Decimal("0")
    if pct > 100:
        return Decimal("100")
    return pct.quantize(Decimal("0.01"))


def _valid_days(value) -> int:
    try:
        days = int(value or 14)
    except Exception:
        days = 14
    return max(1, min(days, 365))


def quotation_money(quotation: Optional[Quotation] = None, items=None, vat_percent=None):
    rows = items if items is not None else (quotation.items if quotation else [])
    subtotal = _money(sum((getattr(item, "total_price", 0) or 0) for item in (rows or [])))
    vat_pct = _vat_percent(vat_percent if vat_percent is not None else getattr(quotation, "vat_percent", None))
    vat_amount = _money(subtotal * vat_pct / Decimal("100"))
    return subtotal, vat_pct, vat_amount, subtotal + vat_amount


def generate_quotation_number() -> str:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"QT-{timestamp}"


def naira(amount) -> str:
    return f"₦{int(round(float(amount or 0))):,}"


def _money(value) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(Decimal("1"))
    except Exception:
        return Decimal("0")


def _email_list(value) -> list:
    if not value:
        return []
    if isinstance(value, str):
        parts = [part.strip() for part in value.replace(";", ",").split(",")]
        return [part for part in parts if part and "@" in part]
    out = []
    for item in value:
        text = str(item or "").strip()
        if text and "@" in text and text not in out:
            out.append(text)
    return out


def _clean_vendor(data: Optional[dict]) -> Optional[dict]:
    if not isinstance(data, dict):
        return None
    out = {}
    mapping = {
        "id": data.get("id") or data.get("vendor_id"),
        "name": data.get("name") or data.get("vendor_name") or data.get("company_name"),
        "phone": data.get("phone") or data.get("vendor_phone"),
        "email": data.get("email") or data.get("vendor_email"),
        "address": data.get("address") or data.get("vendor_address") or data.get("business_address"),
        "domain": data.get("domain") or data.get("vendor_domain"),
    }
    for key, value in mapping.items():
        if value is None or value == "":
            continue
        out[key] = int(value) if key == "id" and str(value).isdigit() else value
    return out or None


def _listing_for_item(db: Session, vendor_product_id: Optional[int] = None, product_id: Optional[int] = None, cost_price=None):
    query = db.query(VendorProduct).options(joinedload(VendorProduct.vendor).joinedload(Vendor.user))
    listing = None
    if vendor_product_id:
        listing = query.filter(VendorProduct.id == int(vendor_product_id)).first()
        if listing:
            return listing
    if not product_id:
        return None
    rows = (
        db.query(VendorProduct)
        .options(joinedload(VendorProduct.vendor).joinedload(Vendor.user))
        .filter(VendorProduct.product_id == int(product_id))
        .all()
    )
    if not rows:
        return None
    if cost_price is not None:
        cost = _money(cost_price)
        priced = [row for row in rows if _money(row.price) == cost]
        if priced:
            return priced[0]
    return min(rows, key=lambda row: int(row.price or 0))


def _vendor_from_listing(db: Session, vendor_product_id: Optional[int] = None, product_id: Optional[int] = None, cost_price=None) -> Optional[dict]:
    listing = _listing_for_item(db, vendor_product_id, product_id, cost_price)
    vendor = listing.vendor if listing else None
    if not vendor:
        return None
    user = getattr(vendor, "user", None)
    snap = _clean_vendor({
        "id": vendor.id,
        "name": vendor.company_name,
        "phone": vendor.phone,
        "email": getattr(user, "email", None),
        "address": vendor.business_address or vendor.address,
        "domain": vendor.domain,
    })
    if snap:
        snap["listing_id"] = listing.id
    return snap


def _item_vendor(item: QuotationItem, db: Optional[Session] = None) -> Optional[dict]:
    snap = _clean_vendor(item.vendor if isinstance(item.vendor, dict) else None)
    if snap and snap.get("name"):
        return snap
    session = db or object_session(item)
    if not session:
        return snap
    found = _vendor_from_listing(
        session,
        getattr(item, "vendor_product_id", None),
        getattr(item, "product_id", None),
        getattr(item, "cost_price", None),
    )
    return found or snap


def _existing_item_map(quotation: Quotation) -> dict:
    out = {}
    for item in quotation.items or []:
        if not item.id:
            continue
        vendor = _item_vendor(item)
        out[item.id] = {
            "cost_price": item.cost_price,
            "vendor_product_id": item.vendor_product_id or (vendor or {}).get("listing_id"),
            "vendor": vendor,
        }
    return out


def quote_recipients(quotation: Quotation) -> list:
    emails = _email_list(quotation.recipient_emails)
    if quotation.customer_email:
        primary = str(quotation.customer_email).strip()
        if primary and "@" in primary and primary not in emails:
            emails.insert(0, primary)
    return emails


def _cover_image(product: Optional[Product] = None, row: Optional[dict] = None) -> Optional[str]:
    sources: list = []
    if row:
        sources.append(row.get("image_url"))
        extras = row.get("image_urls") or []
        if isinstance(extras, list):
            sources.extend(extras)
    if product is not None:
        sources.append(getattr(product, "image_url", None))
        extras = getattr(product, "image_urls", None) or []
        if isinstance(extras, list):
            sources.extend(extras)
    for raw in sources:
        url = str(raw or "").strip()
        if url:
            return url
    return None


def serialize_quotation(quotation: Quotation) -> dict:
    items = []
    session = object_session(quotation)
    product_ids = [item.product_id for item in (quotation.items or []) if item.product_id]
    products = {}
    if session is not None and product_ids:
        for product in session.query(Product).filter(Product.id.in_(product_ids)).all():
            products[product.id] = product
    for item in quotation.items or []:
        product = products.get(item.product_id) if item.product_id else None
        cover = _cover_image(product)
        items.append({
            "id": item.id,
            "product_id": item.product_id,
            "vendor_product_id": item.vendor_product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "cost_price": float(item.cost_price if item.cost_price is not None else item.unit_price or 0),
            "profit_percent": float(item.profit_percent or 0),
            "unit_price": float(item.unit_price or 0),
            "total_price": float(item.total_price or 0),
            "specifications": item.specifications,
            "vendor": _item_vendor(item),
            "image_url": cover,
        })
    business = getattr(quotation, "business", None)
    client = getattr(quotation, "client", None)
    subtotal, vat_pct, vat_amount, total = quotation_money(quotation)
    first = items[0] if items else {}
    return {
        "id": quotation.id,
        "user_id": quotation.user_id,
        "business_id": quotation.business_id,
        "client_id": quotation.client_id,
        "request_id": quotation.request_id,
        "quotation_number": quotation.quotation_number,
        "source_number": getattr(quotation, "source_number", None),
        "document_kind": quotation_kind(quotation),
        "paid_at": quotation.paid_at.isoformat() if getattr(quotation, "paid_at", None) else None,
        "customer_name": quotation.customer_name,
        "customer_email": quotation.customer_email,
        "customer_phone": quotation.customer_phone,
        "customer_address": quotation.customer_address,
        "recipient_emails": _email_list(quotation.recipient_emails),
        "cc_emails": _email_list(quotation.cc_emails),
        "template_kind": quotation.template_kind or (business.template_kind if business else "modern"),
        "vat_percent": float(vat_pct),
        "vat_amount": float(vat_amount),
        "subtotal": float(subtotal),
        "valid_days": _valid_days(getattr(quotation, "valid_days", None)),
        "profit_percent": float(quotation.profit_percent or 0),
        "total_amount": float(total),
        "status": quotation.status,
        "notes": quotation.notes,
        "pdf_url": quotation.pdf_url,
        "created_at": quotation.created_at.isoformat() if quotation.created_at else None,
        "updated_at": (quotation.updated_at or quotation.created_at).isoformat() if (quotation.updated_at or quotation.created_at) else None,
        "items": items,
        "item_name": first.get("product_name"),
        "quantity": first.get("quantity"),
        "image_url": first.get("image_url"),
        "business_name": business.name if business else None,
        "client_name": client.name if client else None,
        "logo_url": business.logo_url if business else None,
    }


def best_catalog_row(rows: Optional[List[dict]]) -> Optional[dict]:
    if not rows:
        return None
    exact = [row for row in rows if row.get("match_kind") in {"exact", "close"}]
    pool = exact or list(rows)
    in_stock = [row for row in pool if int(row.get("stock") or 0) > 0]
    pool = in_stock or pool
    return pool[0] if pool else None


def catalog_row_for_message(rows: Optional[List[dict]], user_message: Optional[str] = None) -> Optional[dict]:
    text = (user_message or "").lower()
    named = []
    for row in rows or []:
        name = str(row.get("name") or "").strip().lower()
        if len(name) >= 3 and name in text:
            named.append(row)
    if named:
        priced = [row for row in named if int(row.get("stock") or 0) > 0 and not row.get("contact_for_price")]
        return (priced or named)[0]
    return best_catalog_row(rows)


def load_quotation(db: Session, quotation_id: int, user_id: int) -> Quotation:
    quotation = (
        db.query(Quotation)
        .options(
            joinedload(Quotation.items),
            joinedload(Quotation.business),
            joinedload(Quotation.client),
        )
        .filter(Quotation.id == quotation_id, Quotation.user_id == user_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return quotation


def quote_from_catalog(
    db: Session,
    user,
    rows: Optional[List[dict]],
    quantity: int = 1,
    business: Optional[BuyerBusiness] = None,
    client: Optional[BusinessClient] = None,
    request: Optional[ClientRequest] = None,
    user_message: Optional[str] = None,
) -> tuple[Optional[Quotation], Optional[str], Optional[dict]]:
    """Issue a quotation from the named catalog match, or the best live match."""
    row = catalog_row_for_message(rows, user_message)
    if not row:
        return None, "I need a catalog match first. Tell me the product, then ask for the quote.", None
    if row.get("contact_for_price"):
        vendor = row.get("vendor_name") or "the vendor"
        phone = row.get("vendor_phone")
        extra = f" ({phone})" if phone else ""
        return None, f"{row.get('name')} is listed as contact for price. Call {vendor}{extra} for a quote.", row
    product_id = row.get("id")
    if not product_id:
        return None, "That match is missing a product id, so I could not issue a quotation.", row
    product = db.query(Product).filter(Product.id == int(product_id)).first()
    if not product:
        return None, "That listing is no longer in the catalog, so I could not issue a quotation.", row
    qty = max(int(quantity or 1), 1)
    try:
        unit = Decimal(str(row.get("price") or 0))
    except Exception:
        unit = Decimal("0")
    if unit <= 0:
        return None, "That listing has no unit price, so I cannot issue a numbered quotation.", row
    specs = row.get("specifications") or {}
    if not isinstance(specs, dict):
        specs = {"details": str(specs)}
    vendor_product_id = row.get("vendor_product_id")
    try:
        vendor_product_id = int(vendor_product_id) if vendor_product_id is not None else None
    except (TypeError, ValueError):
        vendor_product_id = None
    vendor = _vendor_from_listing(db, vendor_product_id) or _clean_vendor(row)
    customer_name = (client.name if client else "") or "Customer"
    raw_email = (client.email if client else None) or None
    customer_email = raw_email if raw_email and "@" in str(raw_email) else None
    recipients = _email_list([customer_email] if customer_email else [])
    payload = QuotationCreate(
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=(client.phone if client else None),
        customer_address=(getattr(client, "address", None) if client else None),
        recipient_emails=recipients or None,
        business_id=business.id if business else None,
        client_id=client.id if client else None,
        request_id=request.id if request else None,
        template_kind=(business.template_kind if business else "modern"),
        vat_percent=_vat_percent(getattr(business, "vat_percent", None) if business else None),
        valid_days=14,
        profit_percent=0,
        items=[
            QuotationItemCreate(
                product_id=int(product_id),
                vendor_product_id=vendor_product_id,
                product_name=row.get("name") or product.name,
                quantity=qty,
                unit_price=unit,
                cost_price=unit,
                profit_percent=0,
                specifications=specs,
                vendor=vendor,
            )
        ],
        notes=QUOTE_COVER_NOTE,
    )
    quotation = create_quotation(db, user.id, payload)
    if not quotation.items:
        return None, "I could not attach that listing to a quotation.", row
    if request:
        request.status = "quoted"
        db.commit()
    try:
        generate_quotation_pdf(quotation, get_quotation_pdf_path(quotation.id))
        quotation.pdf_url = get_quotation_pdf_path(quotation.id)
        db.commit()
        quotation = load_quotation(db, quotation.id, user.id)
    except Exception:
        pass
    data = serialize_quotation(quotation)
    data["item_name"] = row.get("name") or product.name
    data["quantity"] = qty
    data["image_url"] = _cover_image(product, row) or data.get("image_url")
    return quotation, None, data


def _build_items(db: Session, item_rows, existing_by_id: Optional[dict] = None) -> tuple[list, Decimal]:
    items = []
    total_amount = Decimal("0.00")
    existing_by_id = existing_by_id or {}
    for item_data in item_rows or []:
        product = None
        product_id = getattr(item_data, "product_id", None)
        if product_id:
            product = db.query(Product).filter(Product.id == product_id).first()
        if not product and not product_id:
            product = db.query(Product).first()
            product_id = product.id if product else None
        name = (getattr(item_data, "product_name", None) or (product.name if product else "") or "").strip()
        if not name:
            continue
        quantity = max(int(item_data.quantity or 1), 1)
        unit_price = _money(item_data.unit_price)
        prev = existing_by_id.get(getattr(item_data, "id", None)) or {}
        raw_cost = prev.get("cost_price")
        if raw_cost is None:
            raw_cost = getattr(item_data, "cost_price", None)
        cost_price = _money(raw_cost if raw_cost is not None else unit_price)
        raw_pct = getattr(item_data, "profit_percent", None)
        try:
            profit_percent = Decimal(str(raw_pct if raw_pct is not None else 0))
        except Exception:
            profit_percent = Decimal("0")
        total_price = unit_price * quantity
        total_amount += total_price
        vendor_product_id = prev.get("vendor_product_id")
        if vendor_product_id is None:
            vendor_product_id = getattr(item_data, "vendor_product_id", None)
        vendor = prev.get("vendor") or _clean_vendor(getattr(item_data, "vendor", None)) or _vendor_from_listing(
            db, vendor_product_id, product_id, cost_price
        )
        if vendor_product_id is None and vendor:
            vendor_product_id = vendor.get("listing_id")
        items.append(
            QuotationItem(
                product_id=product.id if product else product_id,
                vendor_product_id=vendor_product_id,
                product_name=name,
                quantity=quantity,
                cost_price=cost_price,
                profit_percent=profit_percent,
                unit_price=unit_price,
                total_price=total_price,
                specifications=getattr(item_data, "specifications", None),
                vendor=vendor,
            )
        )
    return items, total_amount


def create_quotation(db: Session, user_id: int, quotation_data: QuotationCreate) -> Quotation:
    items, subtotal = _build_items(db, quotation_data.items)
    business = None
    if quotation_data.business_id:
        business = db.query(BuyerBusiness).filter(BuyerBusiness.id == quotation_data.business_id).first()
    vat_pct = _vat_percent(
        quotation_data.vat_percent if quotation_data.vat_percent is not None else getattr(business, "vat_percent", None)
    )
    _, _, _, total = quotation_money(items=items, vat_percent=vat_pct)
    quotation = Quotation(
        user_id=user_id,
        business_id=quotation_data.business_id,
        client_id=quotation_data.client_id,
        request_id=quotation_data.request_id,
        quotation_number=generate_quotation_number(),
        customer_name=quotation_data.customer_name,
        customer_email=str(quotation_data.customer_email) if quotation_data.customer_email else "",
        customer_phone=quotation_data.customer_phone,
        customer_address=quotation_data.customer_address,
        recipient_emails=_email_list(quotation_data.recipient_emails),
        cc_emails=_email_list(quotation_data.cc_emails),
        template_kind=quotation_data.template_kind,
        vat_percent=vat_pct,
        valid_days=_valid_days(quotation_data.valid_days),
        profit_percent=quotation_data.profit_percent or 0,
        total_amount=total,
        notes=quote_cover_note(quotation_data.notes, "quote"),
        status="draft",
        document_kind="quote",
    )
    db.add(quotation)
    try:
        db.flush()
        for item in items:
            item.quotation_id = quotation.id
            db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return load_quotation(db, quotation.id, user_id)


def update_quotation(db: Session, user, quotation_id: int, data: QuotationUpdate) -> Quotation:
    quotation = load_quotation(db, quotation_id, user.id)
    payload = data.model_dump(exclude_unset=True)
    if payload.get("business_id"):
        get_business(db, user, payload["business_id"])
    if "recipient_emails" in payload:
        payload["recipient_emails"] = _email_list(payload["recipient_emails"])
        if payload["recipient_emails"] and not quotation.customer_email:
            payload["customer_email"] = payload["recipient_emails"][0]
    if "cc_emails" in payload:
        payload["cc_emails"] = _email_list(payload["cc_emails"])
    if "customer_email" in payload:
        payload["customer_email"] = str(payload["customer_email"] or "")
    items_payload = payload.pop("items", None)
    if "vat_percent" in payload:
        payload["vat_percent"] = _vat_percent(payload["vat_percent"])
    if "valid_days" in payload:
        payload["valid_days"] = _valid_days(payload["valid_days"])
    for key, value in payload.items():
        setattr(quotation, key, value)
    if items_payload is not None:
        existing_by_id = _existing_item_map(quotation)
        db.query(QuotationItem).filter(QuotationItem.quotation_id == quotation.id).delete()
        items, _subtotal = _build_items(db, data.items, existing_by_id)
        for item in items:
            item.quotation_id = quotation.id
            db.add(item)
        quotation.items = items
    _, _, _, total = quotation_money(quotation)
    quotation.total_amount = total
    db.commit()
    quotation = load_quotation(db, quotation.id, user.id)
    try:
        generate_quotation_pdf(quotation, get_quotation_pdf_path(quotation.id))
        quotation.pdf_url = get_quotation_pdf_path(quotation.id)
        db.commit()
    except Exception:
        pass
    return load_quotation(db, quotation.id, user.id)


def _retitle_number(number: Optional[str], kind: str) -> str:
    prefix = quotation_meta(kind=kind)["prefix"]
    body = (number or "").strip() or datetime.now().strftime("%Y%m%d%H%M%S")
    for old in ("QT", "INV", "RCT", "QUOTE", "INVOICE", "RECEIPT"):
        token = f"{old}-"
        if body.upper().startswith(token):
            body = body[len(token):]
            break
    return f"{prefix}-{body}"


def _unique_document_number(db: Session, number: str, exclude_id: int) -> str:
    exists = (
        db.query(Quotation)
        .filter(Quotation.quotation_number == number, Quotation.id != exclude_id)
        .first()
    )
    if not exists:
        return number
    return f"{number}-{datetime.now().strftime('%H%M%S')}"


def convert_quotation(db: Session, user, quotation_id: int, kind: str) -> Quotation:
    quotation = load_quotation(db, quotation_id, user.id)
    target = quotation_kind(kind=kind)
    if target not in {"invoice", "receipt"}:
        raise HTTPException(status_code=400, detail="Convert this quote to an invoice or a receipt.")
    current = quotation_kind(quotation)
    allowed = {
        "quote": {"invoice", "receipt"},
        "invoice": {"receipt"},
        "receipt": set(),
    }
    if target == current:
        raise HTTPException(status_code=400, detail=f"This is already a {quotation_meta(kind=target)['noun']}.")
    if target not in allowed.get(current, set()):
        raise HTTPException(status_code=400, detail="This document cannot be converted that way.")
    if not quotation.source_number:
        quotation.source_number = quotation.quotation_number
    quotation.document_kind = target
    quotation.paid_at = quotation.paid_at or datetime.utcnow()
    quotation.status = "paid"
    quotation.quotation_number = _unique_document_number(
        db, _retitle_number(quotation.quotation_number, target), quotation.id
    )
    quotation.notes = cover_for_kind(quotation.notes, target)
    db.commit()
    quotation = load_quotation(db, quotation.id, user.id)
    try:
        generate_quotation_pdf(quotation, get_quotation_pdf_path(quotation.id))
        quotation.pdf_url = get_quotation_pdf_path(quotation.id)
        db.commit()
    except Exception:
        pass
    return load_quotation(db, quotation.id, user.id)


def _local_media(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    if url.startswith("/uploads/"):
        path = url.lstrip("/")
        if os.path.exists(path):
            return path
    if os.path.exists(url):
        return url
    return None


def _rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def _color(hex_color: str):
    return colors.Color(*_rgb(hex_color))


def _template_theme(kind: Optional[str]) -> dict:
    kind = (kind or "modern").lower()
    palettes = {
        "classic": ("#1b2434", "#6b7380", "#1f4e79", "#f4f7fb", "#e4eaf1", "#1b2434"),
        "compact": ("#141414", "#737373", "#171717", "#f6f6f6", "#ececec", "#171717"),
        "modern": ("#12241c", "#6d7f76", "#12a06a", "#f2f8f5", "#e2ece7", "#12241c"),
    }
    ink, muted, accent, card, line, total = palettes.get(kind, palettes["modern"])
    return {
        "ink": _color(ink),
        "muted": _color(muted),
        "accent": _rgb(accent),
        "card": _rgb(card),
        "line": _rgb(line),
        "total": _rgb(total),
        "white": (1, 1, 1),
    }


def generate_quotation_pdf(quotation: Quotation, output_path: str) -> str:
    business = getattr(quotation, "business", None)
    kind = quotation.template_kind or (business.template_kind if business else "modern")
    theme = _template_theme(kind)
    ink, muted_color, accent, card, line, total_bg = (
        theme["ink"],
        theme["muted"],
        theme["accent"],
        theme["card"],
        theme["line"],
        theme["total"],
    )
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=0.72 * inch,
        rightMargin=0.72 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.62 * inch,
    )
    styles = getSampleStyleSheet()
    brand_style = ParagraphStyle(
        "QuoteBrand",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=ink,
        spaceBefore=0,
        spaceAfter=0,
    )
    number_style = ParagraphStyle(
        "QuoteNumber",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=ink,
        alignment=2,
        spaceBefore=4,
        spaceAfter=0,
    )
    label_style = ParagraphStyle(
        "QuoteLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=muted_color,
        spaceBefore=0,
        spaceAfter=6,
    )
    muted = ParagraphStyle("Muted", parent=styles["Normal"], textColor=muted_color, fontSize=9, leading=12)
    muted_right = ParagraphStyle("MutedRight", parent=muted, alignment=2)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14, textColor=ink)
    body_right = ParagraphStyle("BodyRight", parent=body, alignment=2)
    strong = ParagraphStyle("Strong", parent=body, fontName="Helvetica-Bold")
    strong_right = ParagraphStyle("StrongRight", parent=strong, alignment=2)
    white = ParagraphStyle("White", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.white)
    white_right = ParagraphStyle("WhiteRight", parent=white, alignment=2)
    head = ParagraphStyle(
        "TableHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=muted_color,
    )
    head_right = ParagraphStyle("TableHeadRight", parent=head, alignment=2)
    story = []

    letterhead = _local_media(business.letterhead_url if business else None)
    if letterhead:
        try:
            banner = Image(letterhead, width=7.06 * inch, height=1.05 * inch)
            banner.hAlign = "LEFT"
            story.append(banner)
            story.append(Spacer(1, 0.18 * inch))
        except Exception:
            pass

    logo = _local_media(business.logo_url if business else None)
    brand_name = (business.name if business else None) or "ProcureX"
    legal = (business.legal_name if business else None) or brand_name
    brand_bits = []
    if logo:
        try:
            mark = Image(logo, width=0.52 * inch, height=0.52 * inch)
            mark.hAlign = "LEFT"
            brand_bits.append(mark)
        except Exception:
            pass
    contact_lines = [part for part in [
        business.email if business else None,
        business.phone if business else None,
        business.address if business else None,
    ] if part]
    brand_copy = [Paragraph(legal, brand_style)]
    for line in contact_lines:
        brand_copy.append(Paragraph(line, muted))
    if brand_bits:
        brand_cell = Table([[brand_bits[0], brand_copy]], colWidths=[0.62 * inch, 3.4 * inch])
        brand_cell.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
    else:
        brand_cell = brand_copy

    doc_meta = quotation_meta(quotation)
    created = quotation.created_at or datetime.utcnow()
    valid_until = created + timedelta(days=_valid_days(getattr(quotation, "valid_days", None)))
    title_label = doc_meta["title"].title() if doc_meta["title"].isupper() else doc_meta["title"]
    meta = [
        Paragraph(title_label.upper(), label_style),
        Paragraph(quotation.quotation_number, number_style),
        Paragraph(created.strftime("%d %b %Y"), muted_right),
    ]
    header = Table([[brand_cell, meta]], colWidths=[4.4 * inch, 2.66 * inch])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 0.28 * inch))

    bill_bits = [Paragraph("BILL TO", label_style), Paragraph(quotation.customer_name or "—", strong)]
    if quotation.customer_email:
        bill_bits.append(Paragraph(quotation.customer_email, muted))
    for extra in quote_recipients(quotation):
        if extra != quotation.customer_email:
            bill_bits.append(Paragraph(extra, muted))
    if quotation.customer_phone:
        bill_bits.append(Paragraph(quotation.customer_phone, muted))
    if quotation.customer_address:
        bill_bits.append(Paragraph(quotation.customer_address, muted))

    doc_kind = quotation_kind(quotation)
    if doc_kind == "quote":
        second_label, second_value = "VALID UNTIL", valid_until.strftime("%d %b %Y")
    else:
        paid_at = quotation.paid_at or quotation.updated_at or datetime.utcnow()
        second_label, second_value = "PAID", paid_at.strftime("%d %b %Y")
    detail_bits = [
        Paragraph("DETAILS", label_style),
        Paragraph(f"Issue date&nbsp;&nbsp;&nbsp;{created.strftime('%d %b %Y')}", body),
        Paragraph(f"{second_label.title()}&nbsp;&nbsp;&nbsp;{second_value}", body),
    ]
    if quotation.source_number and doc_kind != "quote":
        detail_bits.append(Paragraph(f"Source&nbsp;&nbsp;&nbsp;{quotation.source_number}", muted))

    bill_card = Table([[bill_bits]], colWidths=[3.4 * inch])
    bill_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), card),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    detail_card = Table([[detail_bits]], colWidths=[3.4 * inch])
    detail_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), card),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    cards = Table([[bill_card, detail_card]], colWidths=[3.53 * inch, 3.53 * inch])
    cards.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 8),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(cards)
    story.append(Spacer(1, 0.28 * inch))

    data = [[
        Paragraph("DESCRIPTION", head),
        Paragraph("QTY", head_right),
        Paragraph("UNIT PRICE", head_right),
        Paragraph("AMOUNT", head_right),
    ]]
    for item in quotation.items or []:
        data.append([
            Paragraph(item.product_name or "", body),
            Paragraph(str(item.quantity), body_right),
            Paragraph(naira(item.unit_price), body_right),
            Paragraph(naira(item.total_price), strong_right),
        ])
    table = Table(data, colWidths=[3.35 * inch, 0.7 * inch, 1.55 * inch, 1.46 * inch])
    row_style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 8),
        ("LEFTPADDING", (1, 0), (-1, -1), 6),
        ("RIGHTPADDING", (1, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (0, 0), 0),
        ("BOTTOMPADDING", (0, 0), (0, 0), 8),
        ("BACKGROUND", (0, 0), (-1, 0), card),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 10),
    ]
    table.setStyle(TableStyle(row_style))
    story.append(table)
    story.append(Spacer(1, 0.22 * inch))

    subtotal, vat_pct, vat_amount, total = quotation_money(quotation)
    vat_label = f"{vat_pct.normalize()}%" if vat_pct else "0%"
    totals_rows = [
        [Paragraph("Subtotal", muted), Paragraph(naira(subtotal), body_right)],
        [Paragraph(f"VAT {vat_label}", muted), Paragraph(naira(vat_amount), body_right)],
        [Paragraph("Total", white), Paragraph(naira(total), white_right)],
    ]
    totals_table = Table(totals_rows, colWidths=[1.55 * inch, 1.55 * inch])
    totals_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 1), card),
        ("BACKGROUND", (0, 2), (-1, 2), total_bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, 1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 1), 8),
        ("TOPPADDING", (0, 2), (-1, 2), 10),
        ("BOTTOMPADDING", (0, 2), (-1, 2), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    totals_wrap = Table([["", totals_table]], colWidths=[3.96 * inch, 3.1 * inch])
    totals_wrap.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(totals_wrap)
    if doc_kind in {"invoice", "receipt"}:
        paid = quotation.paid_at or quotation.updated_at or datetime.utcnow()
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph(f"Paid in full on {paid.strftime('%d %b %Y')}.", muted))
    footer = (business.footer_note if business and business.footer_note else None) or (
        "Unit prices are in Naira and exclude VAT. VAT is shown separately. Prepared with ProcureX."
    )
    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(footer, muted))

    def draw_chrome(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(accent)
        canvas.rect(0, 0, 8, A4[1], fill=1, stroke=0)
        canvas.rect(0, A4[1] - 5, A4[0], 5, fill=1, stroke=0)
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_chrome, onLaterPages=draw_chrome)
    return output_path


def get_quotation_pdf_path(quotation_id: int) -> str:
    os.makedirs("quotations", exist_ok=True)
    return f"quotations/quotation_{quotation_id}.pdf"


def _ensure_quotation_pdf(quotation: Quotation) -> str:
    pdf_path = get_quotation_pdf_path(quotation.id)
    generate_quotation_pdf(quotation, pdf_path)
    try:
        quotation.pdf_url = pdf_path
    except Exception:
        pass
    return pdf_path


def send_quotation_email(quotation: Quotation, to: Optional[List[str]] = None, cc: Optional[List[str]] = None) -> list:
    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP_HOST is not configured")
    if not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("SMTP_FROM_EMAIL is not configured")
    recipients = _email_list(to) or quote_recipients(quotation)
    copies = _email_list(cc) if cc is not None else _email_list(quotation.cc_emails)
    if not recipients:
        raise RuntimeError("Add at least one recipient email before sending this quotation.")

    pdf_path = _ensure_quotation_pdf(quotation)
    business = getattr(quotation, "business", None)
    sender_name = (business.name if business else None) or "ProcureX"

    doc_meta = quotation_meta(quotation)
    msg = EmailMessage()
    msg["Subject"] = f"{doc_meta['noun'].title()} {quotation.quotation_number} — {sender_name}"
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = ", ".join(recipients)
    if copies:
        msg["Cc"] = ", ".join(copies)

    body = quote_cover_note(quotation.notes, quotation_kind(quotation))
    body_lines = [
        f"Dear {quotation.customer_name or 'Customer'},",
        "",
        body,
        "",
        "Best regards,",
        sender_name,
    ]
    msg.set_content("\n".join(body_lines))

    with open(pdf_path, "rb") as handle:
        pdf_bytes = handle.read()
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=f"{quotation.quotation_number}.pdf",
    )

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
    return recipients
