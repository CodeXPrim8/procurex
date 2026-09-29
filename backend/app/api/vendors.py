from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import os
import uuid
from pathlib import Path
from ..core.database import get_db
from ..api.dependencies import get_current_user, is_superadmin
from ..models.user import User, UserRole
from ..models.vendor import Vendor, VerificationStatus
from ..models.product import Product, VendorProduct
from ..schemas.vendor import VendorCreate, VendorResponse, VendorUpdate
from ..schemas.product import (
    VendorProductCreate,
    VendorProductResponse,
    ProductCreate,
    ProductResponse,
    coalesce_image_urls,
)
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import joinedload
from ..services.vendor_service import (
    create_vendor,
    update_vendor,
    add_vendor_product,
    update_vendor_product_stock,
    ensure_vendor_for_user,
    _heal_vendor_schema,
)
from ..services.vendor_onboarding import (
    DOC_FIELDS,
    LISTING_BLOCKED_DETAIL,
    VAT_DOC_TYPES,
    accept_terms,
    apply_vat_details,
    can_list_products,
    missing_requirements,
    refresh_vat_status,
    serialize_vendor,
    vat_missing_requirements,
)
from ..schemas.vendor import VatDetailsIn
from ..services.bisonbook.storage import record_vendor_file
from ..services.bisonbook.inventory import set_stock_level
from ..services.bisonbook.common import BisonBookError
from ..services.vendor_service import PricingError, resolve_pricing
from ..services.regions import RegionError, resolve_delivery_mode
from ..services.product_image import MAX_PRODUCT_IMAGES, save_product_image
from ..services.product_assist import assist_product_listing
from ..services.product_service import generate_product_sku, unique_product_sku
from ..schemas.product import (
    VendorProductCreate,
    VendorProductResponse,
    ProductCreate,
    ProductResponse,
    coalesce_image_urls,
)
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import joinedload
from ..services.vendor_service import (
    create_vendor,
    update_vendor,
    add_vendor_product,
    update_vendor_product_stock,
    ensure_vendor_for_user,
    _heal_vendor_schema,
)
from ..services.product_image import MAX_PRODUCT_IMAGES, save_product_image
from ..services.product_assist import assist_product_listing
from ..services.product_service import generate_product_sku, unique_product_sku

router = APIRouter(prefix="/vendors", tags=["vendors"])

ALLOWED_VENDOR_DOCS = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
MAX_VENDOR_DOC_BYTES = 8 * 1024 * 1024


def _vendor_response(vendor: Vendor) -> VendorResponse:
    return VendorResponse.model_validate(serialize_vendor(vendor))


def _require_vendor(db: Session, current_user: User) -> Vendor:
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    return vendor


def _require_verified_vendor(db: Session, current_user: User) -> Vendor:
    vendor = _require_vendor(db, current_user)
    if not can_list_products(vendor):
        raise HTTPException(status_code=403, detail=LISTING_BLOCKED_DETAIL)
    return vendor


@router.post("", response_model=VendorResponse, status_code=201)
async def register_vendor(
    vendor_data: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Register as a vendor."""
    if is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="The superadmin account cannot register as a seller.")
    try:
        # One vendor account per user — return the existing profile instead of erroring.
        try:
            existing_vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
        except OperationalError as exc:
            if "no such column" not in str(exc).lower():
                raise
            _heal_vendor_schema(db)
            existing_vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
        if existing_vendor:
            current_user.role = UserRole.VENDOR
            if not can_list_products(existing_vendor):
                try:
                    updated = update_vendor(
                        db,
                        existing_vendor.id,
                        VendorUpdate(
                            company_name=vendor_data.company_name,
                            business_registration_number=vendor_data.business_registration_number,
                            domain=vendor_data.domain,
                            phone=vendor_data.phone,
                            address=vendor_data.address,
                            personal_name=vendor_data.personal_name,
                            id_type=vendor_data.id_type,
                            id_number=vendor_data.id_number,
                            terms_accepted=vendor_data.terms_accepted,
                            business_address=vendor_data.business_address or vendor_data.address,
                            tin=vendor_data.tin if (vendor_data.charge_vat or vendor_data.tin) else None,
                            tax_clearance_expires_at=vendor_data.tax_clearance_expires_at,
                        ),
                    )
                    return _vendor_response(updated or existing_vendor)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc))
            db.commit()
            return _vendor_response(existing_vendor)
        
        # Validate required field
        if not vendor_data.company_name or not vendor_data.company_name.strip():
            raise HTTPException(status_code=400, detail="Company name is required")
        
        vendor = create_vendor(db, vendor_data, current_user.id, current_user.email)
        
        # Update user role to vendor
        current_user.role = UserRole.VENDOR
        db.commit()
        db.refresh(vendor)
        
        return _vendor_response(vendor)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error registering vendor: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to register vendor: {str(e)}")


@router.get("/me", response_model=VendorResponse)
async def get_my_vendor(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's vendor account. Buyers are not auto-converted to vendors."""
    if is_superadmin(current_user):
        raise HTTPException(status_code=404, detail="Vendor account not found")
    try:
        vendor = (
            db.query(Vendor)
            .options(
                joinedload(Vendor.advice),
                joinedload(Vendor.vendor_products).joinedload(VendorProduct.product),
            )
            .filter(Vendor.user_id == current_user.id)
            .first()
        )
    except OperationalError as exc:
        if "no such column" not in str(exc).lower():
            raise
        _heal_vendor_schema(db)
        vendor = (
            db.query(Vendor)
            .options(
                joinedload(Vendor.advice),
                joinedload(Vendor.vendor_products).joinedload(VendorProduct.product),
            )
            .filter(Vendor.user_id == current_user.id)
            .first()
        )

    if current_user.role != UserRole.VENDOR:
        raise HTTPException(status_code=404, detail="Vendor account not found")

    if vendor:
        return _vendor_response(vendor)

    created = ensure_vendor_for_user(db, current_user)
    return _vendor_response(created)


@router.put("/me", response_model=VendorResponse)
async def update_my_vendor(
    vendor_data: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update current user's vendor account."""
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    
    try:
        updated_vendor = update_vendor(db, vendor.id, vendor_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _vendor_response(updated_vendor)


@router.post("/me/submit", response_model=VendorResponse)
async def submit_vendor_for_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vendor = _require_vendor(db, current_user)
    if can_list_products(vendor):
        return _vendor_response(vendor)
    missing = missing_requirements(vendor)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Complete these items before review: {', '.join(missing)}.",
        )
    if not vendor.terms_accepted_at:
        accept_terms(vendor)
    vendor.verification_status = VerificationStatus.PENDING
    vendor.submitted_at = datetime.utcnow()
    vendor.verification_revoked_at = None
    vendor.verification_notes = "Submitted for ProcureX review."
    db.commit()
    db.refresh(vendor)
    return _vendor_response(vendor)


@router.post("/me/products", response_model=VendorProductResponse, status_code=201)
async def add_product_to_vendor(
    product_data: VendorProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a product to vendor's catalog."""
    vendor = _require_verified_vendor(db, current_user)
    
    # Verify product exists
    product = db.query(Product).filter(Product.id == product_data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    price_mode, price = _pricing_or_400(product.category, product_data.price_mode, product_data.price)
    delivery_mode = _delivery_or_400(product.category, product_data.delivery_mode)

    vendor_product = add_vendor_product(
        db,
        vendor.id,
        product_data.product_id,
        product_data.stock_quantity,
        price,
        price_mode,
        delivery_mode,
    )
    return vendor_product


def _pricing_or_400(category: Optional[str], price_mode: Optional[str], price: Optional[int]) -> tuple[str, int]:
    try:
        return resolve_pricing(category, price_mode, price)
    except PricingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _delivery_or_400(category: Optional[str], delivery_mode: Optional[str]) -> Optional[str]:
    try:
        return resolve_delivery_mode(category, delivery_mode)
    except RegionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class StockUpdate(BaseModel):
    stock_quantity: int


@router.put("/me/products/{vendor_product_id}/stock")
async def update_product_stock(
    vendor_product_id: int,
    stock_data: StockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update stock quantity for a vendor product."""
    vendor = _require_verified_vendor(db, current_user)
    
    vendor_product = db.query(VendorProduct).filter(
        VendorProduct.id == vendor_product_id,
        VendorProduct.vendor_id == vendor.id
    ).first()
    
    if not vendor_product:
        raise HTTPException(status_code=404, detail="Vendor product not found")
    
    try:
        updated = update_vendor_product_stock(db, vendor_product_id, stock_data.stock_quantity)
    except BisonBookError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    return updated


class CreateProductRequest(BaseModel):
    product: ProductCreate
    stock_quantity: int = 0
    price: int = 0  # Price in cents; ignored when price_mode is "contact"
    price_mode: str = "fixed"
    delivery_mode: Optional[str] = None


class ProductAssistRequest(BaseModel):
    name: str = ""
    category: str = ""
    specifications: Optional[dict] = None
    description: Optional[str] = None


def _serialize_vendor_product(vendor_product: VendorProduct) -> VendorProductResponse:
    product = vendor_product.product
    return VendorProductResponse(
        id=vendor_product.id,
        vendor_id=vendor_product.vendor_id,
        product_id=vendor_product.product_id,
        stock_quantity=vendor_product.stock_quantity,
        price=vendor_product.price,
        price_mode=vendor_product.price_mode or "fixed",
        delivery_mode=vendor_product.delivery_mode,
        last_verified=vendor_product.last_verified,
        is_active=vendor_product.is_active,
        admin_assessment=(getattr(vendor_product, "admin_assessment", None) or "pending").strip().lower() or "pending",
        admin_assessment_notes=getattr(vendor_product, "admin_assessment_notes", None),
        admin_assessed_at=getattr(vendor_product, "admin_assessed_at", None),
        admin_assessed_by=getattr(vendor_product, "admin_assessed_by", None),
        product=ProductResponse.model_validate(product) if product else None,
    )


@router.post("/me/products/create", response_model=VendorProductResponse, status_code=201)
async def create_and_add_product(
    request_data: CreateProductRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new product and add it to vendor's catalog."""
    try:
        vendor = _require_verified_vendor(db, current_user)

        product_data = request_data.product
        stock_quantity = request_data.stock_quantity
        if not product_data.name or not product_data.name.strip():
            raise HTTPException(status_code=400, detail="Product name is required")
        if not product_data.category or not product_data.category.strip():
            raise HTTPException(status_code=400, detail="Category is required")
        price_mode, price = _pricing_or_400(product_data.category, request_data.price_mode, request_data.price)
        delivery_mode = _delivery_or_400(product_data.category, request_data.delivery_mode)

        name = product_data.name.strip()
        category = product_data.category.strip()
        sku = (product_data.sku or "").strip().upper() or generate_product_sku(name, category)

        existing_product = db.query(Product).filter(Product.sku == sku).first()
        if existing_product and existing_product.name.strip().lower() == name.lower():
            vendor_product = add_vendor_product(
                db,
                vendor.id,
                existing_product.id,
                stock_quantity,
                price,
                price_mode,
                delivery_mode,
            )
            return _serialize_vendor_product(vendor_product)
        if existing_product:
            sku = unique_product_sku(db, sku)

        payload = product_data.model_dump() if hasattr(product_data, "model_dump") else product_data.dict()
        payload["sku"] = sku
        payload["name"] = name
        payload["category"] = category
        image_urls = coalesce_image_urls(payload.get("image_url"), payload.get("image_urls"))
        payload["image_urls"] = image_urls or None
        payload["image_url"] = image_urls[0] if image_urls else None
        new_product = Product(**payload)
        db.add(new_product)
        db.flush()

        vendor_product = add_vendor_product(
            db,
            vendor.id,
            new_product.id,
            stock_quantity,
            price,
            price_mode,
            delivery_mode,
        )
        db.refresh(vendor_product)
        db.refresh(new_product)
        vendor_product.product = new_product
        return _serialize_vendor_product(vendor_product)
    except HTTPException:
        raise
    except Exception as e:
        import logging
        message = str(e)
        logging.getLogger(__name__).error("Failed to create product: %s", e, exc_info=True)
        db.rollback()
        if "image_urls" in message.lower() and "no such column" in message.lower():
            from ..core.database import migrate_sqlite_schema
            migrate_sqlite_schema()
            raise HTTPException(
                status_code=500,
                detail="Product photo storage was updated. Please click Create Product again.",
            )
        raise HTTPException(status_code=500, detail=f"Failed to create product: {message}")


@router.post("/me/products/assist")
async def assist_product(
    request_data: ProductAssistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suggest listing kind, category check, and a product description."""
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        vendor = ensure_vendor_for_user(db, current_user)
    return assist_product_listing(
        request_data.name,
        request_data.category,
        request_data.specifications,
        request_data.description,
    )


@router.post("/me/products/image")
async def upload_product_image(
    file: UploadFile = File(...),
    product_name: str = Query(..., min_length=2, description="Name of the product in the photo"),
    category: str = Query(..., min_length=2, description="Product category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and validate a single product photo."""
    _require_verified_vendor(db, current_user)

    relative_url, filename = save_product_image(file, product_name.strip(), category.strip())
    return JSONResponse(content={
        "url": relative_url,
        "urls": [relative_url],
        "filename": filename,
        "message": "Product photo accepted",
    })


@router.post("/me/products/images")
async def upload_product_images(
    files: List[UploadFile] = File(...),
    product_name: str = Query(..., min_length=2, description="Name of the product in the photos"),
    category: str = Query(..., min_length=2, description="Product category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and validate one or more product photos."""
    _require_verified_vendor(db, current_user)

    uploads = [item for item in files if item and item.filename]
    if not uploads:
        raise HTTPException(status_code=400, detail="Upload at least one product photo.")
    if len(uploads) > MAX_PRODUCT_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"You can upload up to {MAX_PRODUCT_IMAGES} product photos.",
        )

    urls = []
    for upload in uploads:
        relative_url, _filename = save_product_image(upload, product_name.strip(), category.strip())
        urls.append(relative_url)

    return JSONResponse(content={
        "url": urls[0],
        "urls": urls,
        "message": "Product photos accepted",
    })


@router.get("/me/products", response_model=List[VendorProductResponse])
async def get_my_vendor_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all products in vendor's catalog."""
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        vendor = ensure_vendor_for_user(db, current_user)

    vendor_products = db.query(VendorProduct).options(
        joinedload(VendorProduct.product)
    ).filter(
        VendorProduct.vendor_id == vendor.id
    ).all()
    return [_serialize_vendor_product(item) for item in vendor_products]


@router.put("/me/products/{vendor_product_id}", response_model=VendorProductResponse)
async def update_vendor_product(
    vendor_product_id: int,
    product_data: VendorProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a vendor product (price and stock)."""
    vendor = _require_verified_vendor(db, current_user)
    
    vendor_product = db.query(VendorProduct).filter(
        VendorProduct.id == vendor_product_id,
        VendorProduct.vendor_id == vendor.id
    ).first()
    
    if not vendor_product:
        raise HTTPException(status_code=404, detail="Vendor product not found")
    
    category = vendor_product.product.category if vendor_product.product else None
    vendor_product.price_mode, vendor_product.price = _pricing_or_400(
        category, product_data.price_mode, product_data.price
    )
    vendor_product.delivery_mode = _delivery_or_400(
        category, product_data.delivery_mode or vendor_product.delivery_mode
    )
    try:
        set_stock_level(db, vendor, vendor_product, product_data.stock_quantity, created_by=current_user.email)
    except BisonBookError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    vendor_product.last_verified = datetime.utcnow()
    db.commit()
    db.refresh(vendor_product)
    
    return vendor_product


@router.delete("/me/products/{vendor_product_id}")
async def delete_vendor_product(
    vendor_product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete (deactivate) a vendor product."""
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    
    vendor_product = db.query(VendorProduct).filter(
        VendorProduct.id == vendor_product_id,
        VendorProduct.vendor_id == vendor.id
    ).first()
    
    if not vendor_product:
        raise HTTPException(status_code=404, detail="Vendor product not found")
    
    # Soft delete by deactivating
    vendor_product.is_active = False
    db.commit()
    
    return JSONResponse(content={"message": "Product deactivated successfully"})


@router.post("/me/upload-document")
async def upload_vendor_document(
    file: UploadFile = File(...),
    document_type: str = Query(..., description="Type of document: id_document, address_bill, company_certificate"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a vendor verification document."""
    vendor = _require_vendor(db, current_user)
    allowed_types = ["id_document", "address_bill", "company_certificate", *sorted(VAT_DOC_TYPES)]
    if document_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Allowed types: {allowed_types}")

    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_VENDOR_DOCS:
        raise HTTPException(status_code=400, detail="Upload a PDF, JPG, PNG, or WEBP document.")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_VENDOR_DOCS.values() and content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail="That file type is not accepted.")

    raw = await file.read()
    if not raw or len(raw) < 400:
        raise HTTPException(status_code=400, detail="That file is empty or too small to be a valid document.")
    if len(raw) > MAX_VENDOR_DOC_BYTES:
        raise HTTPException(status_code=400, detail="Each document must be 8MB or smaller.")

    upload_dir = Path("uploads/vendors")
    upload_dir.mkdir(parents=True, exist_ok=True)
    unique_filename = f"{vendor.id}_{document_type}_{uuid.uuid4().hex}{extension}"
    file_path = upload_dir / unique_filename
    try:
        file_path.write_bytes(raw)
        file_url = f"/uploads/vendors/{unique_filename}"
        if document_type == "id_document":
            vendor.id_document_url = file_url
        elif document_type == "address_bill":
            vendor.address_verification_bill_url = file_url
        elif document_type == "company_certificate":
            vendor.company_certificate_url = file_url
        elif document_type == "vat_certificate":
            vendor.vat_certificate_url = file_url
        elif document_type == "tax_clearance":
            vendor.tax_clearance_url = file_url
        record_vendor_file(
            db,
            vendor,
            folder="KYC & Tax",
            name=f"{DOC_FIELDS.get(document_type, document_type)}{extension}",
            url=file_url,
            mime=ALLOWED_VENDOR_DOCS.get(extension),
            size=len(raw),
            source_type="kyc",
            storage_path=str(file_path),
        )
        if document_type in VAT_DOC_TYPES:
            refresh_vat_status(vendor)
        elif vendor.verification_status == VerificationStatus.VERIFIED:
            vendor.verification_status = VerificationStatus.PENDING
            vendor.submitted_at = None
            vendor.verification_notes = "A verification document was replaced. Re-review is required."
        elif vendor.verification_status == VerificationStatus.REJECTED:
            vendor.verification_status = VerificationStatus.PENDING
            vendor.submitted_at = None
        db.commit()
        db.refresh(vendor)
        return JSONResponse(content={
            "message": "Document uploaded successfully",
            "url": file_url,
            "document_type": document_type,
            "vendor": serialize_vendor(vendor),
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")


@router.put("/me/vat", response_model=VendorResponse)
async def update_my_vat_details(
    payload: VatDetailsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save TIN and tax clearance expiry. Changing either sends VAT back to review."""
    vendor = _require_vendor(db, current_user)
    try:
        apply_vat_details(vendor, payload.tin, payload.tax_clearance_expires_at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(vendor)
    return _vendor_response(vendor)


@router.post("/me/vat/request", response_model=VendorResponse)
async def request_vat_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ask ProcureX to review VAT documents so the vendor can start charging VAT."""
    vendor = _require_vendor(db, current_user)
    missing = vat_missing_requirements(vendor)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Add these before requesting VAT approval: {', '.join(missing)}.",
        )
    if (vendor.vat_status or "none") != "approved":
        vendor.vat_status = "pending"
        vendor.vat_review_notes = None
        vendor.vat_reviewed_at = None
        vendor.vat_reviewed_by = None
    db.commit()
    db.refresh(vendor)
    return _vendor_response(vendor)


