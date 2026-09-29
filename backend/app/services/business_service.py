import uuid
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session, joinedload, selectinload
from fastapi import HTTPException, UploadFile
from ..models.user import User
from ..models.business import BuyerBusiness, BusinessClient, ClientRequest
from ..models.quotation import Quotation
from ..schemas.business import QUOTE_TEMPLATES

UPLOAD_DIR = Path("uploads/businesses")
ALLOWED_IMAGES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_BYTES = 6 * 1024 * 1024


def _owned_business(db: Session, user: User, business_id: int) -> BuyerBusiness:
    row = (
        db.query(BuyerBusiness)
        .options(selectinload(BuyerBusiness.clients), selectinload(BuyerBusiness.requests).selectinload(ClientRequest.client))
        .filter(BuyerBusiness.id == business_id, BuyerBusiness.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Business not found")
    return row


def list_businesses(db: Session, user: User) -> list[BuyerBusiness]:
    rows = (
        db.query(BuyerBusiness)
        .options(selectinload(BuyerBusiness.clients), selectinload(BuyerBusiness.requests).selectinload(ClientRequest.client))
        .filter(BuyerBusiness.user_id == user.id)
        .order_by(BuyerBusiness.is_default.desc(), BuyerBusiness.created_at.asc())
        .all()
    )
    if rows:
        default = next((item for item in rows if item.is_default), rows[0])
        db.query(Quotation).filter(Quotation.user_id == user.id, Quotation.business_id.is_(None)).update(
            {Quotation.business_id: default.id},
            synchronize_session=False,
        )
        db.commit()
        return rows
    return [ensure_default_business(db, user)]


def ensure_default_business(db: Session, user: User) -> BuyerBusiness:
    existing = (
        db.query(BuyerBusiness)
        .filter(BuyerBusiness.user_id == user.id)
        .order_by(BuyerBusiness.is_default.desc(), BuyerBusiness.id.asc())
        .first()
    )
    if existing:
        return existing
    name = (getattr(user, "full_name", None) or "").strip() or (
        user.email.split("@")[0] if user.email else "My business"
    )
    row = BuyerBusiness(
        user_id=user.id,
        name=name,
        email=user.email,
        template_kind="classic",
        is_default=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.query(Quotation).filter(Quotation.user_id == user.id, Quotation.business_id.is_(None)).update(
        {Quotation.business_id: row.id},
        synchronize_session=False,
    )
    db.commit()
    return row


def get_business(db: Session, user: User, business_id: Optional[int]) -> Optional[BuyerBusiness]:
    if business_id:
        return _owned_business(db, user, business_id)
    return (
        db.query(BuyerBusiness)
        .filter(BuyerBusiness.user_id == user.id, BuyerBusiness.is_default == True)  # noqa: E712
        .first()
    ) or ensure_default_business(db, user)


def _clear_default(db: Session, user_id: int, keep_id: Optional[int] = None) -> None:
    q = db.query(BuyerBusiness).filter(BuyerBusiness.user_id == user_id, BuyerBusiness.is_default == True)  # noqa: E712
    if keep_id:
        q = q.filter(BuyerBusiness.id != keep_id)
    q.update({"is_default": False})


def create_business(db: Session, user: User, data) -> BuyerBusiness:
    kind = (data.template_kind or "classic").lower()
    if kind not in QUOTE_TEMPLATES:
        kind = "classic"
    others = db.query(BuyerBusiness).filter(BuyerBusiness.user_id == user.id).count()
    make_default = bool(data.is_default) or others == 0
    if make_default:
        _clear_default(db, user.id)
    row = BuyerBusiness(
        user_id=user.id,
        name=(data.name or "").strip() or "Untitled business",
        legal_name=(data.legal_name or None),
        email=str(data.email) if data.email else None,
        phone=data.phone,
        address=data.address,
        template_kind=kind,
        vat_percent=data.vat_percent if data.vat_percent is not None else 7.5,
        footer_note=data.footer_note,
        is_default=make_default,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_business(db: Session, user: User, business_id: int, data) -> BuyerBusiness:
    row = _owned_business(db, user, business_id)
    payload = data.model_dump(exclude_unset=True)
    if "template_kind" in payload:
        kind = (payload["template_kind"] or "classic").lower()
        if kind not in QUOTE_TEMPLATES:
            raise HTTPException(status_code=400, detail="Choose classic, modern, or compact.")
        payload["template_kind"] = kind
    if payload.get("is_default"):
        _clear_default(db, user.id, keep_id=row.id)
    for key, value in payload.items():
        if key == "email" and value is not None:
            value = str(value)
        if key == "name" and value is not None:
            value = str(value).strip() or row.name
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_business(db: Session, user: User, business_id: int) -> None:
    row = _owned_business(db, user, business_id)
    was_default = row.is_default
    db.delete(row)
    db.commit()
    if was_default:
        nxt = db.query(BuyerBusiness).filter(BuyerBusiness.user_id == user.id).first()
        if nxt:
            nxt.is_default = True
            db.commit()


def save_brand_file(db: Session, user: User, business_id: int, file: UploadFile, kind: str) -> BuyerBusiness:
    if kind not in {"logo", "letterhead"}:
        raise HTTPException(status_code=400, detail="Upload a logo or letterhead.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGES:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, or WebP image.")
    raw = file.file.read()
    if not raw or len(raw) < 80:
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Each image must be 6MB or smaller.")
    row = _owned_business(db, user, business_id)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{row.id}_{kind}_{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / filename
    path.write_bytes(raw)
    url = f"/uploads/businesses/{filename}"
    if kind == "logo":
        row.logo_url = url
    else:
        row.letterhead_url = url
    db.commit()
    db.refresh(row)
    return row


def create_client(db: Session, user: User, business_id: int, data) -> BusinessClient:
    business = _owned_business(db, user, business_id)
    row = BusinessClient(
        business_id=business.id,
        name=(data.name or "").strip() or "Customer",
        email=str(data.email) if data.email else None,
        phone=data.phone,
        company=data.company,
        address=getattr(data, "address", None),
        notes=data.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_client(db: Session, user: User, business_id: int, client_id: int, data) -> BusinessClient:
    _owned_business(db, user, business_id)
    row = (
        db.query(BusinessClient)
        .filter(BusinessClient.id == client_id, BusinessClient.business_id == business_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "email" and value is not None:
            value = str(value)
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_client(db: Session, user: User, business_id: int, client_id: int) -> None:
    _owned_business(db, user, business_id)
    row = (
        db.query(BusinessClient)
        .filter(BusinessClient.id == client_id, BusinessClient.business_id == business_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(row)
    db.commit()


def create_request(db: Session, user: User, business_id: int, data) -> ClientRequest:
    business = _owned_business(db, user, business_id)
    client_id = data.client_id
    if client_id:
        client = (
            db.query(BusinessClient)
            .filter(BusinessClient.id == client_id, BusinessClient.business_id == business.id)
            .first()
        )
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
    status = (data.status or "open").lower()
    if status not in {"open", "sourcing", "quoted", "closed"}:
        status = "open"
    row = ClientRequest(
        business_id=business.id,
        client_id=client_id,
        title=(data.title or "").strip() or "New request",
        description=data.description,
        status=status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_request(db: Session, user: User, business_id: int, request_id: int, data) -> ClientRequest:
    _owned_business(db, user, business_id)
    row = (
        db.query(ClientRequest)
        .options(joinedload(ClientRequest.client))
        .filter(ClientRequest.id == request_id, ClientRequest.business_id == business_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    payload = data.model_dump(exclude_unset=True)
    if "status" in payload and payload["status"]:
        status = str(payload["status"]).lower()
        if status not in {"open", "sourcing", "quoted", "closed"}:
            raise HTTPException(status_code=400, detail="Invalid request status.")
        payload["status"] = status
    if payload.get("client_id"):
        client = (
            db.query(BusinessClient)
            .filter(BusinessClient.id == payload["client_id"], BusinessClient.business_id == business_id)
            .first()
        )
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
    for key, value in payload.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_request(db: Session, user: User, business_id: int, request_id: int) -> None:
    _owned_business(db, user, business_id)
    row = (
        db.query(ClientRequest)
        .filter(ClientRequest.id == request_id, ClientRequest.business_id == business_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    db.delete(row)
    db.commit()
