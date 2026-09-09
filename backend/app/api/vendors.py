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
from ..api.dependencies import get_current_user
from ..models.user import User, UserRole
from ..models.vendor import Vendor
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
from ..services.product_image import MAX_PRODUCT_IMAGES, save_product_image

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.post("", response_model=VendorResponse, status_code=201)
async def register_vendor(
    vendor_data: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Register as a vendor."""
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
            db.commit()
            return existing_vendor
        
        # Validate required field
        if not vendor_data.company_name or not vendor_data.company_name.strip():
            raise HTTPException(status_code=400, detail="Company name is required")
        
        vendor = create_vendor(db, vendor_data, current_user.id)
        
        # Update user role to vendor
        current_user.role = UserRole.VENDOR
        db.commit()
        db.refresh(vendor)
        
        return vendor
    except HTTPException:
        raise
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
    try:
        vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    except OperationalError as exc:
        if "no such column" not in str(exc).lower():
            raise
        _heal_vendor_schema(db)
        vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()

    if current_user.role != UserRole.VENDOR:
        raise HTTPException(status_code=404, detail="Vendor account not found")

    if vendor:
        return vendor

    return ensure_vendor_for_user(db, current_user)


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
    
    updated_vendor = update_vendor(db, vendor.id, vendor_data)
    return updated_vendor


@router.post("/me/products", response_model=VendorProductResponse, status_code=201)
async def add_product_to_vendor(
    product_data: VendorProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a product to vendor's catalog."""
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    
    # Verify product exists
    product = db.query(Product).filter(Product.id == product_data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    vendor_product = add_vendor_product(
        db,
        vendor.id,
        product_data.product_id,
        product_data.stock_quantity,
        product_data.price
    )
    return vendor_product


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
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    
    vendor_product = db.query(VendorProduct).filter(
        VendorProduct.id == vendor_product_id,
        VendorProduct.vendor_id == vendor.id
    ).first()
    
    if not vendor_product:
        raise HTTPException(status_code=404, detail="Vendor product not found")
    
    updated = update_vendor_product_stock(db, vendor_product_id, stock_data.stock_quantity)
    return updated


class CreateProductRequest(BaseModel):
    product: ProductCreate
    stock_quantity: int = 0
    price: int  # Price in cents


def _serialize_vendor_product(vendor_product: VendorProduct) -> VendorProductResponse:
    product = vendor_product.product
    return VendorProductResponse(
        id=vendor_product.id,
        vendor_id=vendor_product.vendor_id,
        product_id=vendor_product.product_id,
        stock_quantity=vendor_product.stock_quantity,
        price=vendor_product.price,
        last_verified=vendor_product.last_verified,
        is_active=vendor_product.is_active,
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
        vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
        if not vendor:
            vendor = ensure_vendor_for_user(db, current_user)

        product_data = request_data.product
        stock_quantity = request_data.stock_quantity
        price = request_data.price

        if price <= 0:
            raise HTTPException(status_code=400, detail="Price must be greater than 0")
        if not product_data.name or not product_data.name.strip():
            raise HTTPException(status_code=400, detail="Product name is required")
        if not product_data.sku or not product_data.sku.strip():
            raise HTTPException(status_code=400, detail="SKU is required")
        if not product_data.category or not product_data.category.strip():
            raise HTTPException(status_code=400, detail="Category is required")

        sku = product_data.sku.strip().upper()

        existing_product = db.query(Product).filter(Product.sku == sku).first()
        if existing_product:
            vendor_product = add_vendor_product(
                db,
                vendor.id,
                existing_product.id,
                stock_quantity,
                price,
            )
            return _serialize_vendor_product(vendor_product)

        payload = product_data.model_dump() if hasattr(product_data, "model_dump") else product_data.dict()
        payload["sku"] = sku
        payload["name"] = product_data.name.strip()
        payload["category"] = product_data.category.strip()
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


@router.post("/me/products/image")
async def upload_product_image(
    file: UploadFile = File(...),
    product_name: str = Query(..., min_length=2, description="Name of the product in the photo"),
    category: str = Query(..., min_length=2, description="Product category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and validate a single product photo."""
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        vendor = ensure_vendor_for_user(db, current_user)

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
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        vendor = ensure_vendor_for_user(db, current_user)

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
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    
    vendor_product = db.query(VendorProduct).filter(
        VendorProduct.id == vendor_product_id,
        VendorProduct.vendor_id == vendor.id
    ).first()
    
    if not vendor_product:
        raise HTTPException(status_code=404, detail="Vendor product not found")
    
    vendor_product.price = product_data.price
    vendor_product.stock_quantity = product_data.stock_quantity
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
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor account not found")
    
    # Validate document type
    allowed_types = ["id_document", "address_bill", "company_certificate"]
    if document_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Allowed types: {allowed_types}")
    
    # Create uploads directory if it doesn't exist
    upload_dir = Path("uploads/vendors")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix
    unique_filename = f"{vendor.id}_{document_type}_{uuid.uuid4()}{file_extension}"
    file_path = upload_dir / unique_filename
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Create URL (in production, this would be a proper CDN URL)
        file_url = f"/uploads/vendors/{unique_filename}"
        
        # Update vendor record with document URL
        if document_type == "id_document":
            vendor.id_document_url = file_url
        elif document_type == "address_bill":
            vendor.address_verification_bill_url = file_url
        elif document_type == "company_certificate":
            vendor.company_certificate_url = file_url
        
        db.commit()
        
        return JSONResponse(content={
            "message": "Document uploaded successfully",
            "url": file_url,
            "document_type": document_type
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")


