from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from ..core.database import get_db
from ..api.dependencies import get_current_user, is_admin_user
from ..models.user import User
from ..models.product import Product, VendorProduct
from ..models.vendor import Vendor, VendorAdvice, VerificationStatus
from ..schemas.product import ProductCreate, ProductResponse, coalesce_image_urls
from ..models.bisonbook import SalesLine, StockMovement
from ..schemas.vendor import VendorResponse, VendorReviewIn, VendorAdviceIn, ProductAssessIn, VatReviewIn
from ..services.product_service import generate_product_sku, unique_product_sku
from ..services.vendor_onboarding import serialize_vendor, missing_requirements, vat_missing_requirements

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to require admin role."""
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.post("/products", response_model=ProductResponse, status_code=201)
async def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new product (admin only)."""
    name = (product_data.name or "").strip()
    category = (product_data.category or "").strip()
    sku = (product_data.sku or "").strip().upper() or generate_product_sku(name, category)
    sku = unique_product_sku(db, sku)

    payload = product_data.model_dump() if hasattr(product_data, "model_dump") else product_data.dict()
    payload["name"] = name
    payload["category"] = category
    payload["sku"] = sku
    product = Product(**payload)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/products", response_model=List[ProductResponse])
async def list_all_products(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """List all products (admin only)."""
    products = db.query(Product).all()
    return products


@router.get("/vendors")
async def list_vendors_for_review(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = db.query(Vendor).options(joinedload(Vendor.user)).order_by(Vendor.updated_at.desc())
    if status_filter == "revoked":
        query = query.filter(Vendor.verification_revoked_at.isnot(None))
    elif status_filter:
        try:
            query = query.filter(Vendor.verification_status == VerificationStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=400, detail="Status must be pending, verified, rejected, or revoked")
        if status_filter == "rejected":
            query = query.filter(Vendor.verification_revoked_at.is_(None))
    rows = []
    counts = dict(
        db.query(VendorProduct.vendor_id, func.count(VendorProduct.id))
        .group_by(VendorProduct.vendor_id)
        .all()
    )
    for vendor in query.all():
        payload = serialize_vendor(vendor)
        payload["email"] = vendor.user.email if vendor.user else None
        payload["owner_name"] = vendor.user.full_name if vendor.user else None
        payload["product_count"] = int(counts.get(vendor.id, 0) or 0)
        rows.append(payload)
    return rows


@router.post("/vendors/{vendor_id}/review", response_model=VendorResponse)
async def review_vendor(
    vendor_id: int,
    payload: VendorReviewIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    action = (payload.action or "").strip().lower()
    notes = (payload.notes or "").strip()
    if action not in {"approve", "reject", "revoke"}:
        raise HTTPException(status_code=400, detail="Action must be approve, reject, or revoke")
    if action in {"reject", "revoke"} and len(notes) < 8:
        raise HTTPException(status_code=400, detail="Add a reason so the vendor can fix it.")
    if action == "approve":
        missing = missing_requirements(vendor)
        if missing:
            raise HTTPException(status_code=400, detail=f"Application is incomplete: {', '.join(missing)}.")
        vendor.verification_status = VerificationStatus.VERIFIED
        vendor.verification_notes = notes or "Approved after document review."
        vendor.verification_revoked_at = None
    else:
        if action == "revoke" and vendor.verification_status != VerificationStatus.VERIFIED:
            raise HTTPException(status_code=400, detail="Only a verified vendor can be revoked.")
        vendor.verification_status = VerificationStatus.REJECTED
        vendor.verification_notes = notes
        vendor.submitted_at = None
        if action == "revoke":
            vendor.verification_revoked_at = datetime.utcnow()
        else:
            vendor.verification_revoked_at = None
    vendor.reviewed_at = datetime.utcnow()
    vendor.reviewed_by = admin.email
    db.commit()
    db.refresh(vendor)
    return VendorResponse.model_validate(serialize_vendor(vendor))


def _require_admin_vendor(db: Session, vendor_id: int) -> Vendor:
    vendor = (
        db.query(Vendor)
        .options(
            joinedload(Vendor.user),
            joinedload(Vendor.vendor_products).joinedload(VendorProduct.product),
            joinedload(Vendor.advice),
        )
        .filter(Vendor.id == vendor_id)
        .first()
    )
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


def _serialize_admin_listing(listing: VendorProduct) -> dict:
    product = listing.product
    images = coalesce_image_urls(
        getattr(product, "image_url", None) if product else None,
        getattr(product, "image_urls", None) if product else None,
    )
    assessment = (getattr(listing, "admin_assessment", None) or "pending").strip().lower() or "pending"
    return {
        "id": listing.id,
        "product_id": listing.product_id,
        "name": product.name if product else "Unknown product",
        "sku": product.sku if product else None,
        "category": product.category if product else None,
        "description": product.description if product else None,
        "specifications": product.specifications if product else None,
        "image_url": images[0] if images else None,
        "image_urls": images,
        "stock_quantity": listing.stock_quantity,
        "price": listing.price,
        "price_mode": listing.price_mode or "fixed",
        "is_active": bool(listing.is_active),
        "admin_assessment": assessment,
        "admin_assessment_notes": listing.admin_assessment_notes,
        "admin_assessed_at": listing.admin_assessed_at,
        "admin_assessed_by": listing.admin_assessed_by,
        "created_at": listing.created_at,
        "updated_at": listing.updated_at,
    }


def _vendor_admin_payload(vendor: Vendor) -> dict:
    listings = list(vendor.vendor_products or [])
    listings.sort(key=lambda item: ((item.product.name if item.product else "") or "").lower())
    payload = serialize_vendor(vendor)
    payload["email"] = vendor.user.email if vendor.user else None
    payload["owner_name"] = vendor.user.full_name if vendor.user else None
    payload["product_count"] = len(listings)
    payload["products"] = [_serialize_admin_listing(item) for item in listings]
    return payload


def _require_listing(vendor: Vendor, listing_id: int) -> VendorProduct:
    listing = next((item for item in (vendor.vendor_products or []) if item.id == listing_id), None)
    if not listing:
        raise HTTPException(status_code=404, detail="Product listing not found for this vendor")
    return listing


@router.get("/vendors/{vendor_id}")
async def get_vendor_for_admin(
    vendor_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return _vendor_admin_payload(_require_admin_vendor(db, vendor_id))


@router.post("/vendors/{vendor_id}/products/{listing_id}/assess")
async def assess_vendor_product(
    vendor_id: int,
    listing_id: int,
    payload: ProductAssessIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = _require_admin_vendor(db, vendor_id)
    listing = _require_listing(vendor, listing_id)
    action = (payload.action or "").strip().lower()
    notes = (payload.notes or "").strip()
    if action not in {"approve", "flag", "hide"}:
        raise HTTPException(status_code=400, detail="Action must be approve, flag, or hide")
    if action in {"flag", "hide"} and len(notes) < 8:
        raise HTTPException(status_code=400, detail="Add a short note so the vendor knows what to change.")
    now = datetime.utcnow()
    listing.admin_assessment = "approved" if action == "approve" else ("flagged" if action == "flag" else "hidden")
    listing.admin_assessment_notes = notes or None
    listing.admin_assessed_at = now
    listing.admin_assessed_by = admin.email
    listing.is_active = action != "hide"
    if notes:
        product_name = listing.product.name if listing.product else "this listing"
        prefix = {
            "approve": f"Listing approved: {product_name}.",
            "flag": f"Changes needed on {product_name}.",
            "hide": f"{product_name} is hidden from buyers.",
        }[action]
        db.add(
            VendorAdvice(
                vendor_id=vendor.id,
                vendor_product_id=listing.id,
                message=f"{prefix} {notes}".strip(),
                created_by=admin.email,
            )
        )
    db.commit()
    return _vendor_admin_payload(_require_admin_vendor(db, vendor_id))


@router.delete("/vendors/{vendor_id}/products/{listing_id}")
async def delete_vendor_listing(
    vendor_id: int,
    listing_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = _require_admin_vendor(db, vendor_id)
    listing = _require_listing(vendor, listing_id)
    product_name = listing.product.name if listing.product else "a listing"
    db.query(VendorAdvice).filter(VendorAdvice.vendor_product_id == listing.id).update(
        {VendorAdvice.vendor_product_id: None},
        synchronize_session=False,
    )
    db.query(StockMovement).filter(StockMovement.vendor_product_id == listing.id).delete(synchronize_session=False)
    db.query(SalesLine).filter(SalesLine.vendor_product_id == listing.id).update(
        {SalesLine.vendor_product_id: None},
        synchronize_session=False,
    )
    db.delete(listing)
    db.add(
        VendorAdvice(
            vendor_id=vendor.id,
            vendor_product_id=None,
            message=f'ProcureX removed "{product_name}" from your catalog.',
            created_by=admin.email,
        )
    )
    db.commit()
    return _vendor_admin_payload(_require_admin_vendor(db, vendor_id))


@router.post("/vendors/{vendor_id}/vat")
async def review_vendor_vat(
    vendor_id: int,
    payload: VatReviewIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = _require_admin_vendor(db, vendor_id)
    action = (payload.action or "").strip().lower()
    notes = (payload.notes or "").strip()
    if action not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="Action must be approve or reject")
    if action == "reject" and len(notes) < 8:
        raise HTTPException(status_code=400, detail="Add a reason so the vendor can fix their VAT documents.")
    if action == "approve":
        missing = vat_missing_requirements(vendor)
        if missing:
            raise HTTPException(status_code=400, detail=f"VAT profile is incomplete: {', '.join(missing)}.")
        vendor.vat_status = "approved"
        message = "VAT approved. Your invoices and quotes now include VAT."
    else:
        vendor.vat_status = "rejected"
        message = "VAT documents rejected. You cannot charge VAT until this is fixed."
    vendor.vat_review_notes = notes or None
    vendor.vat_reviewed_at = datetime.utcnow()
    vendor.vat_reviewed_by = admin.email
    db.add(
        VendorAdvice(
            vendor_id=vendor.id,
            vendor_product_id=None,
            message=f"{message} {notes}".strip(),
            created_by=admin.email,
        )
    )
    db.commit()
    return _vendor_admin_payload(_require_admin_vendor(db, vendor_id))


@router.post("/vendors/{vendor_id}/advice")
async def advise_vendor(
    vendor_id: int,
    payload: VendorAdviceIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = _require_admin_vendor(db, vendor_id)
    message = (payload.message or "").strip()
    if len(message) < 8:
        raise HTTPException(status_code=400, detail="Advice must be at least 8 characters.")
    listing_id = payload.vendor_product_id
    if listing_id is not None:
        _require_listing(vendor, listing_id)
    db.add(
        VendorAdvice(
            vendor_id=vendor.id,
            vendor_product_id=listing_id,
            message=message,
            created_by=admin.email,
        )
    )
    db.commit()
    return _vendor_admin_payload(_require_admin_vendor(db, vendor_id))
