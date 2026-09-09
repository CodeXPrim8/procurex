from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from ..models.product import Product, VendorProduct
from ..models.vendor import Vendor
from ..schemas.product import ProductSearch


def search_products(
    db: Session,
    search_query: ProductSearch,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """Search products with fuzzy matching and filters."""
    query = db.query(Product)
    
    # Text search in name, description, SKU
    if search_query.query:
        search_term = f"%{search_query.query.lower()}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_term),
                Product.description.ilike(search_term),
                Product.sku.ilike(search_term)
            )
        )
    
    # Category filter
    if search_query.category:
        query = query.filter(Product.category == search_query.category)
    
    products = query.limit(limit).all()
    
    # Get vendor products with availability
    results = []
    for product in products:
        vendor_products = db.query(VendorProduct).filter(
            and_(
                VendorProduct.product_id == product.id,
                VendorProduct.is_active == True,
                VendorProduct.stock_quantity > 0
            )
        ).all()
        
        if vendor_products:
            # Get the best price or first available
            best_vendor_product = min(vendor_products, key=lambda vp: vp.price)
            vendor = best_vendor_product.vendor
            
            results.append({
                "id": product.id,
                "name": product.name,
                "sku": product.sku,
                "category": product.category,
                "description": product.description,
                "specifications": product.specifications or {},
                "price": best_vendor_product.price,
                "stock": best_vendor_product.stock_quantity,
                "vendor_id": best_vendor_product.vendor_id,
                "vendor_product_id": best_vendor_product.id,
                "image_url": product.image_url,
                "available_vendors": len(vendor_products),
                "vendor_name": vendor.company_name if vendor else None,
                "vendor_phone": vendor.phone if vendor else None,
                "vendor_domain": vendor.domain if vendor else None,
            })
    
    return results


def get_product_by_id(db: Session, product_id: int) -> Optional[Product]:
    """Get product by ID."""
    return db.query(Product).filter(Product.id == product_id).first()


def get_vendor_products_for_product(
    db: Session,
    product_id: int
) -> List[VendorProduct]:
    """Get all vendor products for a specific product."""
    return db.query(VendorProduct).filter(
        and_(
            VendorProduct.product_id == product_id,
            VendorProduct.is_active == True
        )
    ).all()


def find_alternative_products(
    db: Session,
    unavailable_product_id: int,
    category: Optional[str] = None,
    max_price: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Find alternative products when requested product is unavailable."""
    unavailable_product = get_product_by_id(db, unavailable_product_id)
    if not unavailable_product:
        return []
    
    query = db.query(Product).filter(
        and_(
            Product.id != unavailable_product_id,
            Product.category == (category or unavailable_product.category)
        )
    )
    
    # Get products with available vendor products
    products = query.all()
    alternatives = []
    
    for product in products:
        vendor_products = db.query(VendorProduct).filter(
            and_(
                VendorProduct.product_id == product.id,
                VendorProduct.is_active == True,
                VendorProduct.stock_quantity > 0
            )
        ).all()
        
        if vendor_products:
            best_vendor_product = min(vendor_products, key=lambda vp: vp.price)
            
            if max_price is None or best_vendor_product.price <= max_price:
                alternatives.append({
                    "id": product.id,
                    "name": product.name,
                    "sku": product.sku,
                    "category": product.category,
                    "specifications": product.specifications or {},
                    "price": best_vendor_product.price,
                    "stock": best_vendor_product.stock_quantity,
                    "vendor_id": best_vendor_product.vendor_id,
                    "vendor_product_id": best_vendor_product.id,
                    "image_url": product.image_url
                })
    
    # Sort by price (ascending)
    alternatives.sort(key=lambda x: x["price"])
    return alternatives[:5]  # Return top 5 alternatives



