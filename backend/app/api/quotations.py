from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import os
from ..core.database import get_db
from ..api.dependencies import get_current_user
from ..models.user import User
from ..models.quotation import Quotation
from ..schemas.quotation import QuotationCreate, QuotationResponse, QuotationUpdate, QuotationSend, QuotationConvert
from ..services.quotation_service import (
    create_quotation,
    generate_quotation_pdf,
    get_quotation_pdf_path,
    send_quotation_email,
    update_quotation,
    load_quotation,
    serialize_quotation,
    convert_quotation,
    quotation_kind,
)

router = APIRouter(prefix="/quotations", tags=["quotations"])


def _out(quotation: Quotation) -> QuotationResponse:
    return QuotationResponse(**serialize_quotation(quotation))


@router.post("", response_model=QuotationResponse, status_code=201)
async def create_quotation_endpoint(
    quotation_data: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    quotation = create_quotation(db, current_user.id, quotation_data)
    try:
        generate_quotation_pdf(quotation, get_quotation_pdf_path(quotation.id))
        quotation.pdf_url = get_quotation_pdf_path(quotation.id)
        db.commit()
        quotation = load_quotation(db, quotation.id, current_user.id)
    except Exception:
        pass
    return _out(quotation)


@router.get("", response_model=List[QuotationResponse])
async def get_quotations(
    business_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        db.query(Quotation)
        .options(joinedload(Quotation.items), joinedload(Quotation.business), joinedload(Quotation.client))
        .filter(Quotation.user_id == current_user.id)
    )
    if business_id:
        query = query.filter(Quotation.business_id == business_id)
    rows = query.order_by(Quotation.created_at.desc()).all()
    return [_out(row) for row in rows]


@router.get("/{quotation_id}", response_model=QuotationResponse)
async def get_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return _out(load_quotation(db, quotation_id, current_user.id))


@router.patch("/{quotation_id}", response_model=QuotationResponse)
async def patch_quotation(
    quotation_id: int,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _out(update_quotation(db, current_user, quotation_id, payload))


@router.get("/{quotation_id}/pdf")
async def get_quotation_pdf(
    quotation_id: int,
    inline: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    quotation = load_quotation(db, quotation_id, current_user.id)
    pdf_path = get_quotation_pdf_path(quotation_id)
    generate_quotation_pdf(quotation, pdf_path)
    quotation.pdf_url = pdf_path
    db.commit()
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"{quotation.quotation_number}.pdf",
        content_disposition_type="inline" if inline else "attachment",
    )


@router.post("/{quotation_id}/convert", response_model=QuotationResponse)
async def convert_quotation_endpoint(
    quotation_id: int,
    payload: QuotationConvert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _out(convert_quotation(db, current_user, quotation_id, payload.kind))


@router.post("/{quotation_id}/send")
async def send_quotation(
    quotation_id: int,
    payload: Optional[QuotationSend] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    quotation = load_quotation(db, quotation_id, current_user.id)
    body = payload or QuotationSend()
    try:
        sent_to = send_quotation_email(
            quotation,
            to=[str(item) for item in (body.to or [])] or None,
            cc=[str(item) for item in (body.cc or [])] or None,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to send quotation email") from e

    if body.to:
        quotation.recipient_emails = [str(item) for item in body.to]
    if body.cc is not None:
        quotation.cc_emails = [str(item) for item in body.cc]
    if quotation.status == "draft":
        quotation.status = "sent"
    db.commit()
    noun = "quotation" if quotation_kind(quotation) == "quote" else quotation_kind(quotation)
    return {"message": f"{noun.title()} sent successfully", "status": quotation.status, "to": sent_to}
