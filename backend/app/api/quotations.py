from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os
from ..core.database import get_db
from ..api.dependencies import get_current_user
from ..models.user import User
from ..models.quotation import Quotation
from ..schemas.quotation import QuotationCreate, QuotationResponse
from ..services.quotation_service import (
    create_quotation,
    generate_quotation_pdf,
    get_quotation_pdf_path,
    send_quotation_email,
)

router = APIRouter(prefix="/quotations", tags=["quotations"])


@router.post("", response_model=QuotationResponse, status_code=201)
async def create_quotation_endpoint(
    quotation_data: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new quotation."""
    quotation = create_quotation(db, current_user.id, quotation_data)
    return quotation


@router.get("", response_model=List[QuotationResponse])
async def get_quotations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all quotations for current user."""
    quotations = db.query(Quotation).filter(
        Quotation.user_id == current_user.id
    ).order_by(Quotation.created_at.desc()).all()
    return quotations


@router.get("/{quotation_id}", response_model=QuotationResponse)
async def get_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific quotation."""
    quotation = db.query(Quotation).filter(
        Quotation.id == quotation_id,
        Quotation.user_id == current_user.id
    ).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return quotation


@router.get("/{quotation_id}/pdf")
async def get_quotation_pdf(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate and download quotation PDF."""
    quotation = db.query(Quotation).filter(
        Quotation.id == quotation_id,
        Quotation.user_id == current_user.id
    ).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    
    pdf_path = get_quotation_pdf_path(quotation_id)
    
    # Generate PDF if it doesn't exist
    if not os.path.exists(pdf_path):
        generate_quotation_pdf(quotation, pdf_path)
        # Update quotation with PDF URL
        quotation.pdf_url = pdf_path
        db.commit()
    
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"quotation_{quotation.quotation_number}.pdf"
    )


@router.post("/{quotation_id}/send")
async def send_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send quotation via email to the customer."""
    quotation = db.query(Quotation).filter(
        Quotation.id == quotation_id,
        Quotation.user_id == current_user.id
    ).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")

    # Attempt to send email; surface configuration or SMTP errors clearly.
    try:
        send_quotation_email(quotation)
    except RuntimeError as e:
        # Configuration problems (e.g. missing SMTP settings)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to send quotation email") from e

    quotation.status = "sent"
    db.commit()
    
    return {"message": "Quotation sent successfully", "status": "sent"}


