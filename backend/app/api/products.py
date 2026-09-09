from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from ..core.database import get_db
from ..api.dependencies import get_current_user
from ..models.user import User
from ..models.product import Product, VendorProduct
from ..schemas.product import ProductCreate, ProductResponse, ProductSearch, VendorProductResponse
from ..services.product_service import search_products, get_product_by_id, find_alternative_products

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/search", response_model=List[dict])
async def search_products_endpoint(
    q: str = Query(..., description="Search query"),
    category: str = Query(None, description="Product category"),
    min_price: int = Query(None, description="Minimum price in cents"),
    max_price: int = Query(None, description="Maximum price in cents"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Search for products."""
    search_query = ProductSearch(
        query=q,
        category=category,
        min_price=min_price,
        max_price=max_price
    )
    results = search_products(db, search_query)
    return results


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get product details by ID."""
    product = get_product_by_id(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/alternatives", response_model=List[dict])
async def get_alternative_products(
    product_id: int,
    category: str = Query(None),
    max_price: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get alternative products when requested product is unavailable."""
    alternatives = find_alternative_products(db, product_id, category, max_price)
    return alternatives


@router.get("/{product_id}/vendors", response_model=List[VendorProductResponse])
async def get_product_vendors(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all vendors offering a specific product."""
    vendor_products = db.query(VendorProduct).filter(
        VendorProduct.product_id == product_id,
        VendorProduct.is_active == True
    ).all()
    return vendor_products



