from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..core.database import get_db
from ..api.dependencies import get_current_user
from ..models.user import User
from ..models.product import Product, VendorProduct
from ..models.vendor import Vendor, VerificationStatus
from ..schemas.product import ProductCreate, ProductResponse, ProductSearch, VendorProductResponse
from ..services.product_service import search_products, get_catalog_product, find_alternative_products
from ..services.regions import buyer_country_for, vendor_country, visible_in

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/search", response_model=List[dict])
async def search_products_endpoint(
    q: str = Query(..., description="Search query"),
    category: str = Query(None, description="Product category"),
    min_price: int = Query(None, description="Minimum price in cents"),
    max_price: int = Query(None, description="Maximum price in cents"),
    country: Optional[str] = Query(None, description="Buyer country (ISO alpha-2) when not saved on the account"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Search for products available in the buyer's region."""
    search_query = ProductSearch(
        query=q,
        category=category,
        min_price=min_price,
        max_price=max_price,
        buyer_country=buyer_country_for(current_user, country),
    )
    results = search_products(db, search_query)
    return results


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    country: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get product details by ID, including live vendor price and stock."""
    product = get_catalog_product(db, product_id, buyer_country_for(current_user, country))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/alternatives", response_model=List[dict])
async def get_alternative_products(
    product_id: int,
    category: str = Query(None),
    max_price: int = Query(None),
    country: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get alternative products when requested product is unavailable."""
    alternatives = find_alternative_products(
        db, product_id, category, max_price, buyer_country_for(current_user, country)
    )
    return alternatives


@router.get("/{product_id}/vendors", response_model=List[VendorProductResponse])
async def get_product_vendors(
    product_id: int,
    country: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the vendors offering a specific product in the buyer's region."""
    buyer_country = buyer_country_for(current_user, country)
    vendor_products = (
        db.query(VendorProduct)
        .join(Vendor, Vendor.id == VendorProduct.vendor_id)
        .filter(
            VendorProduct.product_id == product_id,
            VendorProduct.is_active == True,
            Vendor.verification_status == VerificationStatus.VERIFIED,
        )
        .all()
    )
    return [
        listing for listing in vendor_products
        if visible_in(
            buyer_country,
            listing.product.category if listing.product else None,
            listing.delivery_mode,
            vendor_country(listing.vendor),
        )
    ]
