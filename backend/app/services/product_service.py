from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from ..models.product import Product, VendorProduct
from ..models.vendor import Vendor, VerificationStatus
from ..models.user import User
from ..schemas.product import ProductSearch

DEMO_CATALOG = [
    {
        "name": "Dell Latitude 5540",
        "sku": "PX-LT-DELL-5540",
        "category": "Laptop",
        "description": "14-inch business laptop for office work, reporting, and travel.",
        "specifications": {"ram": "16GB", "storage": "512GB SSD", "processor": "Intel Core i7", "screen_size": "14 inch"},
        "price": 1150000,
        "stock": 12,
    },
    {
        "name": "HP EliteBook 840 G10",
        "sku": "PX-LT-HP-840",
        "category": "Laptop",
        "description": "Premium 14-inch laptop for professional and executive use.",
        "specifications": {"ram": "16GB", "storage": "512GB SSD", "processor": "Intel Core i7", "screen_size": "14 inch"},
        "price": 1280000,
        "stock": 8,
    },
    {
        "name": "Lenovo ThinkPad E14 Gen 5",
        "sku": "PX-LT-LEN-E14",
        "category": "Laptop",
        "description": "Durable office laptop with strong keyboard and battery life.",
        "specifications": {"ram": "8GB", "storage": "256GB SSD", "processor": "AMD Ryzen 5", "screen_size": "14 inch"},
        "price": 780000,
        "stock": 15,
    },
    {
        "name": "Apple MacBook Air 13 M3",
        "sku": "PX-LT-APL-M3",
        "category": "Laptop",
        "description": "Lightweight laptop for design, documentation, and executive mobility.",
        "specifications": {"ram": "16GB", "storage": "256GB SSD", "processor": "Apple M3", "screen_size": "13.6 inch"},
        "price": 1850000,
        "stock": 4,
    },
    {
        "name": "Samsung Galaxy A55 5G",
        "sku": "PX-PH-SAM-A55",
        "category": "Phone",
        "description": "Android business phone with a strong camera and long battery life.",
        "specifications": {"ram": "8GB", "storage": "256GB"},
        "price": 485000,
        "stock": 20,
    },
    {
        "name": "Tecno Camon 30",
        "sku": "PX-PH-TEC-C30",
        "category": "Phone",
        "description": "Affordable Android phone for field staff and everyday communication.",
        "specifications": {"ram": "8GB", "storage": "256GB"},
        "price": 245000,
        "stock": 30,
    },
    {
        "name": "Apple iPhone 15",
        "sku": "PX-PH-APL-15",
        "category": "Phone",
        "description": "Flagship iPhone for management and customer-facing roles.",
        "specifications": {"ram": "6GB", "storage": "128GB"},
        "price": 1250000,
        "stock": 6,
    },
    {
        "name": "Infinix Note 40",
        "sku": "PX-PH-INF-N40",
        "category": "Phone",
        "description": "Budget Android phone with fast charging for high-volume staff kits.",
        "specifications": {"ram": "8GB", "storage": "256GB"},
        "price": 198000,
        "stock": 25,
    },
    {
        "name": "HP 24-inch Full HD Monitor",
        "sku": "PX-MN-HP-24",
        "category": "Monitor",
        "description": "24-inch office monitor for accounting, admin, and general workstation use.",
        "specifications": {"screen_size": "24 inch", "resolution": "1920x1080"},
        "price": 185000,
        "stock": 18,
    },
    {
        "name": "Logitech MK270 Wireless Keyboard and Mouse",
        "sku": "PX-AC-LOG-MK270",
        "category": "Accessories",
        "description": "Reliable wireless keyboard and mouse set for office desks.",
        "specifications": {"connectivity": "Wireless"},
        "price": 28000,
        "stock": 40,
    },
]


def ensure_demo_catalog(db: Session) -> None:
    """Seed a verified catalog so procurement chat can answer from real stock."""
    if db.query(Product).count() > 0:
        return

    vendor = db.query(Vendor).order_by(Vendor.id.asc()).first()
    if not vendor:
        claimed_ids = [row[0] for row in db.query(Vendor.user_id).all()]
        user_query = db.query(User)
        if claimed_ids:
            user_query = user_query.filter(~User.id.in_(claimed_ids))
        vendor_user = user_query.order_by(User.id.asc()).first()
        if not vendor_user:
            return
        vendor = Vendor(
            user_id=vendor_user.id,
            company_name=vendor_user.full_name or "ProcureX Marketplace",
            verification_status=VerificationStatus.VERIFIED,
        )
        db.add(vendor)
        db.flush()
    elif not vendor.company_name:
        vendor.company_name = "ProcureX Marketplace"

    for item in DEMO_CATALOG:
        product = Product(
            name=item["name"],
            sku=item["sku"],
            category=item["category"],
            description=item["description"],
            specifications=item["specifications"],
            base_price=item["price"],
        )
        db.add(product)
        db.flush()
        db.add(
            VendorProduct(
                vendor_id=vendor.id,
                product_id=product.id,
                stock_quantity=item["stock"],
                price=item["price"],
                is_active=True,
            )
        )
    db.commit()


def search_products(
    db: Session,
    search_query: ProductSearch,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """Search products with fuzzy matching and filters."""
    ensure_demo_catalog(db)
    query = db.query(Product)
    text_query = (search_query.query or "").strip()
    generic_terms = {
        "what", "whats", "what's", "show", "me", "available", "find", "products",
        "product", "under", "in", "stock", "do", "you", "have", "the", "a",
    }
    searchable = " ".join(
        word for word in text_query.lower().split() if word.strip("?.,") not in generic_terms
    )
    in_stock_only = bool(getattr(search_query, "in_stock_only", False))

    if searchable and not search_query.category and not search_query.max_price and not in_stock_only:
        search_term = f"%{searchable}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_term),
                Product.description.ilike(search_term),
                Product.sku.ilike(search_term),
                Product.category.ilike(search_term),
            )
        )

    if search_query.category:
        query = query.filter(Product.category.ilike(search_query.category))

    if search_query.brand:
        query = query.filter(Product.name.ilike(f"%{search_query.brand}%"))

    products = query.limit(max(limit * 4, 40)).all()
    results = []
    for product in products:
        vendor_filter = [
            VendorProduct.product_id == product.id,
            VendorProduct.is_active == True,
        ]
        if in_stock_only:
            vendor_filter.append(VendorProduct.stock_quantity > 0)
        vendor_products = db.query(VendorProduct).filter(and_(*vendor_filter)).all()
        if not vendor_products:
            continue
        available = [item for item in vendor_products if item.stock_quantity > 0]
        best = min(available or vendor_products, key=lambda item: item.price)
        if search_query.max_price is not None and best.price > search_query.max_price:
            continue
        if search_query.min_price is not None and best.price < search_query.min_price:
            continue
        vendor = best.vendor
        results.append({
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "category": product.category,
            "description": product.description,
            "specifications": product.specifications or {},
            "price": best.price,
            "stock": best.stock_quantity,
            "vendor_id": best.vendor_id,
            "vendor_product_id": best.id,
            "image_url": product.image_url,
            "image_urls": list(product.image_urls or []) if product.image_urls else ([product.image_url] if product.image_url else []),
            "available_vendors": len(available) or len(vendor_products),
            "vendor_name": vendor.company_name if vendor else None,
            "vendor_phone": vendor.phone if vendor else None,
            "vendor_domain": vendor.domain if vendor else None,
        })

    results.sort(key=lambda item: (item["stock"] <= 0, item["price"]))
    return results[:limit]


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
                    "image_url": product.image_url,
                    "image_urls": list(product.image_urls or []) if product.image_urls else ([product.image_url] if product.image_url else []),
                })
    
    # Sort by price (ascending)
    alternatives.sort(key=lambda x: x["price"])
    return alternatives[:5]  # Return top 5 alternatives



