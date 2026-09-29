from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, cast, String
from ..models.product import Product, VendorProduct
from ..models.vendor import Vendor, VerificationStatus
from ..models.user import User, UserRole
from ..schemas.product import ProductSearch
from .regions import availability_scope, vendor_country, visible_in
import re
import uuid

CATEGORY_SKU_CODES = {
    "Laptop": "LT",
    "Desktop": "DT",
    "Tablet": "TB",
    "Phone": "PH",
    "Monitor": "MN",
    "Keyboard": "KB",
    "Mouse": "MS",
    "Printer": "PR",
    "Server": "SR",
    "Networking": "NT",
    "Storage": "ST",
    "Accessories": "AC",
    "Software": "SW",
    "Service": "SV",
}


def _sku_slug(value: str) -> str:
    tokens = re.sub(r"[^A-Za-z0-9]+", "-", (value or "").upper()).strip("-").split("-")
    return "-".join(part for part in tokens if part)[:40]


def generate_product_sku(name: str, category: str) -> str:
    code = CATEGORY_SKU_CODES.get(category) or _sku_slug(category)[:3] or "GN"
    slug = _sku_slug(name) or "ITEM"
    slug = "-".join(slug.split("-")[:4])
    return f"PX-{code}-{slug}"[:40]


def unique_product_sku(db: Session, base: str) -> str:
    sku = (base or "PX-GN-ITEM").upper()[:40]
    existing = db.query(Product).filter(Product.sku == sku).first()
    if not existing:
        return sku
    n = 2
    while n < 1000:
        suffix = f"-{n}"
        candidate = f"{sku[: 40 - len(suffix)]}{suffix}"
        if not db.query(Product).filter(Product.sku == candidate).first():
            return candidate
        n += 1
    return f"{sku[:31]}-{uuid.uuid4().hex[:8].upper()}"

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

EXTENDED_DEMO_CATALOG = [
    {
        "name": "StockFlow Inventory Cloud",
        "sku": "PX-SW-INV-CLOUD",
        "category": "Software",
        "description": "Cloud inventory software for shops and warehouses. Track stock, low-level alerts, purchase orders, and multi-location counts.",
        "specifications": {
            "solves": "Inventory and stock control",
            "platform": "Web",
            "license": "SaaS subscription",
            "deployment": "Cloud",
        },
        "price": 45000,
        "stock": 99,
    },
    {
        "name": "LedgerLite Accounting",
        "sku": "PX-SW-ACC-LEDGER",
        "category": "Software",
        "description": "Accounting and invoicing software for SMEs. Invoices, payroll, expense tracking, and Naira reports.",
        "specifications": {
            "solves": "Accounting, invoicing, payroll",
            "platform": "Web, Windows",
            "license": "SaaS subscription",
            "deployment": "Cloud",
        },
        "price": 38000,
        "stock": 99,
    },
    {
        "name": "ClientHub CRM",
        "sku": "PX-SW-CRM-HUB",
        "category": "Software",
        "description": "CRM for sales teams. Capture leads, follow up customers, and see the pipeline on web and mobile.",
        "specifications": {
            "solves": "Customer and sales pipeline management",
            "platform": "Web, Android, iOS",
            "license": "SaaS subscription",
            "deployment": "Cloud",
        },
        "price": 52000,
        "stock": 99,
    },
    {
        "name": "ShopTill POS",
        "sku": "PX-SW-POS-TILL",
        "category": "Software",
        "description": "Point of sale software for retail and restaurants. Sales, receipts, and daily cash-up.",
        "specifications": {
            "solves": "In-store sales and receipts",
            "platform": "Windows, Android",
            "license": "One-time license",
            "deployment": "On-premise or cloud",
        },
        "price": 95000,
        "stock": 40,
    },
    {
        "name": "Company Website Design & Build",
        "sku": "PX-SV-WEB-SITE",
        "category": "Service",
        "description": "Custom company website: design, mobile-friendly pages, contact forms, and handover training.",
        "specifications": {
            "service_type": "Website",
            "deliverable": "Up to 8-page company website",
            "timeline": "2–4 weeks",
            "includes": "Design, development, 30-day support",
        },
        "price": 350000,
        "stock": 8,
    },
    {
        "name": "Mobile App Development",
        "sku": "PX-SV-APP-MOBILE",
        "category": "Service",
        "description": "Custom Android and iOS app for your business workflow, with admin dashboard and launch support.",
        "specifications": {
            "service_type": "Mobile app",
            "deliverable": "Android + iOS app and admin dashboard",
            "timeline": "6–12 weeks",
            "includes": "UX, development, testing, 60-day support",
        },
        "price": 2500000,
        "stock": 4,
    },
    {
        "name": "Custom Software Development",
        "sku": "PX-SV-SOFT-CUSTOM",
        "category": "Service",
        "description": "Bespoke software to solve an operations problem: portals, internal tools, and integrations.",
        "specifications": {
            "service_type": "Custom software",
            "deliverable": "Scoped web system with source handover",
            "timeline": "4–16 weeks",
            "includes": "Discovery, build, training, 90-day support",
        },
        "price": 1800000,
        "stock": 5,
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


def ensure_searchable_demo_listings(db: Session) -> Vendor:
    """Keep seeded PX-* listings on a verified host if the original vendor was later rejected."""
    marketplace = db.query(Vendor).filter(Vendor.company_name == "ProcureX Marketplace").first()
    if not marketplace:
        email = "marketplace@procurex.local"
        host = db.query(User).filter(User.email == email).first()
        if not host:
            host = User(
                email=email,
                hashed_password="!",
                full_name="ProcureX Marketplace",
                role=UserRole.VENDOR,
                is_active=False,
            )
            db.add(host)
            db.flush()
        marketplace = Vendor(
            user_id=host.id,
            company_name="ProcureX Marketplace",
            country="NG",
            verification_status=VerificationStatus.VERIFIED,
            verification_notes="Platform host for seeded catalog listings.",
        )
        db.add(marketplace)
        db.flush()
    elif marketplace.verification_status != VerificationStatus.VERIFIED:
        marketplace.verification_status = VerificationStatus.VERIFIED

    demo_ids = [row[0] for row in db.query(Product.id).filter(Product.sku.like("PX-%")).all()]
    if demo_ids:
        listings = db.query(VendorProduct).filter(VendorProduct.product_id.in_(demo_ids)).all()
        for listing in listings:
            host = listing.vendor
            verified = (
                host
                and host.verification_status == VerificationStatus.VERIFIED
                and not getattr(host, "verification_revoked_at", None)
            )
            if verified:
                continue
            listing.vendor_id = marketplace.id
            listing.is_active = True
        db.commit()
    return marketplace


def ensure_extended_catalog(db: Session) -> None:
    """Add software and service listings even if hardware catalog already exists."""
    ensure_demo_catalog(db)
    vendor = ensure_searchable_demo_listings(db)
    if not vendor:
        return
    existing = {sku for (sku,) in db.query(Product.sku).all()}
    added = False
    for item in EXTENDED_DEMO_CATALOG:
        if item["sku"] in existing:
            continue
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
                delivery_mode="remote" if item["category"] == "Service" else None,
                is_active=True,
            )
        )
        added = True
    if added:
        db.commit()


SEARCH_STOPWORDS = {
    "what", "whats", "show", "me", "available", "find", "products", "product",
    "under", "below", "in", "stock", "do", "you", "have", "the", "a", "an",
    "need", "want", "looking", "for", "something", "that", "will", "solve",
    "problem", "help", "please", "can", "get", "who", "build", "to", "i",
    "am", "is", "are", "of", "or", "and", "with", "my", "our", "any", "some",
    "this", "those", "these", "like", "about", "from", "one", "ones", "buy",
    "purchase", "quote", "quotation", "price", "prices", "cost", "budget",
    "naira", "ngn", "usd", "hello", "hi", "hey", "ok", "okay", "yes", "no",
}

CATEGORY_STOPWORDS = {
    "laptop", "laptops", "notebook", "notebooks", "computer", "computers",
    "phone", "phones", "smartphone", "smartphones", "mobile", "mobiles",
    "tablet", "tablets", "monitor", "monitors", "screen", "desktop",
    "printer", "printers", "server", "servers", "keyboard", "keyboards", "mouse",
    "mice", "storage", "ssd", "hdd", "router", "switch", "networking",
    "accessory", "accessories", "software", "softwares", "saas", "application",
    "applications", "service", "services", "website", "websites",
}

# Pasted spec sheets include these labels. They are not product identity.
SPEC_LABEL_TOKENS = {
    "ram", "memory", "storage", "processor", "cpu", "gpu", "screen", "size",
    "display", "resolution", "connectivity", "license", "platform", "deployment",
    "solves", "type", "deliverable", "timeline", "includes", "spec", "specs",
    "specification", "specifications", "capacity", "model", "brand", "gb", "tb",
    "inch", "inches", "hertz", "hz", "core", "cores", "gen", "generation",
    "screen_size", "hard", "drive", "disk",
}


def _normalize_search_text(text: str) -> str:
    value = (text or "").lower()
    value = value.replace("×", "x")
    value = re.sub(r"(\d+)\s+(gb|tb|mb)\b", r"\1\2", value)
    value = re.sub(r"(\d+(?:\.\d+)?)\s*(?:inch|inches|in)\b", r"\1inch", value)
    value = re.sub(r"\bcore\s*i([3579])\b", r"i\1", value)
    return value


def extract_spec_hints(text: str) -> Dict[str, str]:
    """Pull RAM, storage, CPU, and screen size out of a buyer sentence or pasted spec sheet."""
    lower = _normalize_search_text(text)
    hints: Dict[str, str] = {}
    ram = re.search(
        r"(?:ram|memory)[^\n]{0,16}?(\d+)[ \t]*gb\b|\b(\d+)[ \t]*gb[ \t]+(?:ram|memory)\b",
        lower,
    )
    if ram:
        hints["ram"] = f"{ram.group(1) or ram.group(2)}gb"
    storage = re.search(
        r"(?:storage|ssd|hdd)[^\n]{0,16}?(\d+)[ \t]*(gb|tb)\b|\b(\d+)[ \t]*(gb|tb)[ \t]+(?:ssd|hdd)\b",
        lower,
    )
    if storage:
        amount = storage.group(1) or storage.group(3)
        unit = storage.group(2) or storage.group(4)
        hints["storage"] = f"{amount}{unit}"
    cpu = re.search(r"\b(i[3579]|ryzen\s*[3579]|apple\s*m[1-4]|m[1-4])\b", lower)
    if cpu:
        hints["processor"] = re.sub(r"\s+", " ", cpu.group(1)).strip()
    screen = re.search(r"\b(13|13\.6|14|15|15\.6|16|17|21|24|27|32)inch\b", lower)
    if screen:
        hints["screen_size"] = screen.group(1) + "inch"
    return hints


def distinctive_search_tokens(text: str) -> List[str]:
    words = re.findall(r"[a-z0-9.]+", _normalize_search_text(text))
    tokens: List[str] = []
    skip = SEARCH_STOPWORDS | CATEGORY_STOPWORDS | SPEC_LABEL_TOKENS
    for word in words:
        token = word.strip(".")
        if token in skip:
            continue
        if len(token) < 2:
            continue
        if token not in tokens:
            tokens.append(token)
    return tokens


def _product_search_blob(product: Product) -> str:
    specs = product.specifications or {}
    if isinstance(specs, dict):
        spec_text = " ".join(f"{key} {value}" for key, value in specs.items())
    else:
        spec_text = str(specs or "")
    return _normalize_search_text(
        " ".join(
            part
            for part in (
                product.name or "",
                product.sku or "",
                product.description or "",
                product.category or "",
                spec_text,
            )
            if part
        )
    )


def _hint_score(product: Product, hints: Optional[Dict[str, str]]) -> int:
    if not hints:
        return 0
    specs = product.specifications if isinstance(product.specifications, dict) else {}
    normalized = {
        str(key).lower(): _normalize_search_text(str(value)).replace(" ", "")
        for key, value in specs.items()
    }
    blob = _product_search_blob(product).replace(" ", "")
    score = 0
    hits = 0
    for key, value in hints.items():
        needle = _normalize_search_text(value).replace(" ", "")
        haystack = (normalized.get(key) or "") + blob
        if needle and needle in haystack:
            score += 90
            hits += 1
        else:
            score -= 12
    if hits and hits == len(hints):
        score += 140
    return score


def _bias_score(product: Product, bias: Optional[Dict[str, Any]]) -> int:
    if not bias:
        return 0
    score = 0
    name = (product.name or "").lower()
    category = (product.category or "")
    if category in (bias.get("categories") or []):
        score += 18
    for brand in bias.get("brands") or []:
        if brand and brand in name:
            score += 28
            break
    score += min(_hint_score(product, bias.get("specs") or {}), 80)
    if product.id in set(bias.get("product_ids") or []):
        score += 22
    return score


def _rank_product(
    product: Product,
    tokens: List[str],
    brand: Optional[str],
    category: Optional[str],
    spec_hints: Optional[Dict[str, str]] = None,
    bias: Optional[Dict[str, Any]] = None,
) -> tuple:
    name = _normalize_search_text(product.name or "")
    sku = (product.sku or "").lower()
    blob = _product_search_blob(product)
    brand_l = (brand or "").lower()
    hint_bonus = _hint_score(product, spec_hints)
    memory_bonus = _bias_score(product, bias)
    if not tokens:
        score = 20 if category and (product.category or "").lower() == (category or "").lower() else 10
        if brand_l and brand_l in name:
            score += 40
        score += hint_bonus + memory_bonus
        kind = "close" if hint_bonus >= 90 else "match"
        return score, kind

    strong = [token for token in tokens if not re.fullmatch(r"\d{1,2}", token)]
    weak = [token for token in tokens if re.fullmatch(r"\d{1,2}", token)]
    focus = strong or tokens
    core = [token for token in focus if token != brand_l]
    phrase = " ".join(tokens)
    score = hint_bonus + memory_bonus
    if phrase and phrase in name:
        score += 1000
    if all(token in name for token in focus):
        score += 700
    elif core and all(token in name for token in core):
        score += 500
    elif core and all(token in blob for token in core):
        score += 280
    elif all(token in blob for token in focus):
        score += 220
    for token in focus:
        if token in name:
            score += 55
        elif token in sku:
            score += 40
        elif token in blob:
            score += 14
    for token in weak:
        if token in name or token in blob:
            score += 10
    if brand_l and brand_l in name:
        score += 35
    if category and (product.category or "").lower() == category.lower():
        score += 8

    if (phrase and phrase in name) or all(token in name for token in focus):
        kind = "exact"
    elif hint_bonus >= 140:
        kind = "exact"
    elif core and (all(token in name for token in core) or all(token in blob for token in core)):
        kind = "close"
    elif hint_bonus >= 90:
        kind = "close"
    elif not core and brand_l and brand_l in name:
        kind = "exact"
    else:
        kind = "related"
    return score, kind


def _token_filters(tokens: List[str]):
    clauses = []
    spec_column = cast(Product.specifications, String)
    for token in tokens[:10]:
        term = f"%{token}%"
        clauses.extend(
            [
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.description.ilike(term),
                Product.category.ilike(term),
                spec_column.ilike(term),
            ]
        )
    return clauses


def search_products(
    db: Session,
    search_query: ProductSearch,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """Search products by keywords, pasted specs, and category, ranking exact matches first."""
    ensure_extended_catalog(db)
    text_query = (search_query.query or "").strip()
    tokens = distinctive_search_tokens(text_query)
    brand = (search_query.brand or "").strip() or None
    category = (search_query.category or "").strip() or None
    spec_hints = dict(search_query.spec_hints or {}) or extract_spec_hints(text_query)
    bias = search_query.buyer_bias or {}
    in_stock_only = bool(getattr(search_query, "in_stock_only", False))

    def collect(use_category: Optional[str]) -> List[Product]:
        query = db.query(Product)
        if use_category:
            query = query.filter(Product.category.ilike(use_category))
        elif tokens:
            query = query.filter(or_(*_token_filters(tokens)))
        elif brand:
            query = query.filter(Product.name.ilike(f"%{brand}%"))
        elif spec_hints:
            query = query.filter(or_(*_token_filters(list(spec_hints.values()))))
        products = query.limit(400).all()
        seen_ids = {product.id for product in products}
        if use_category and (tokens or spec_hints):
            extra_query = db.query(Product)
            extra_clauses = _token_filters(tokens or list(spec_hints.values()))
            if extra_clauses:
                extra_query = extra_query.filter(or_(*extra_clauses))
            if seen_ids:
                extra_query = extra_query.filter(Product.id.notin_(list(seen_ids)))
            for product in extra_query.limit(80).all():
                score, kind = _rank_product(product, tokens, brand, None, spec_hints, bias)
                if kind in {"exact", "close"}:
                    products.append(product)
                    seen_ids.add(product.id)
        return products

    products = collect(category)
    ranked: List[tuple] = []

    def rank_into(candidates: List[Product]) -> None:
        ranked.clear()
        for product in candidates:
            score, kind = _rank_product(product, tokens, brand, category, spec_hints, bias)
            row = product_to_catalog_dict(
                db,
                product,
                in_stock_only=False,
                require_vendor=True,
                buyer_country=search_query.buyer_country,
            )
            if not row:
                continue
            priced = row.get("price") is not None
            if priced and search_query.max_price is not None and row["price"] > search_query.max_price:
                continue
            if priced and search_query.min_price is not None and row["price"] < search_query.min_price:
                continue
            row["match_kind"] = kind
            row["match_score"] = score
            ranked.append((score, kind, row))

    rank_into(products)
    if not ranked and category:
        rank_into(collect(None))

    ranked.sort(
        key=lambda item: (
            {"exact": 0, "close": 1, "match": 2, "related": 3}.get(item[1], 4),
            -item[0],
            int(item[2].get("stock") or 0) <= 0,
            item[2].get("price") is None,
            item[2].get("price") or 0,
        )
    )

    exact: List[Dict[str, Any]] = []
    close: List[Dict[str, Any]] = []
    related: List[Dict[str, Any]] = []
    matches: List[Dict[str, Any]] = []
    for _score, kind, row in ranked:
        stock = int(row.get("stock") or 0)
        if kind in {"exact", "close"}:
            bucket = exact if kind == "exact" else close
            bucket.append(row)
        elif kind == "related":
            if in_stock_only and stock <= 0:
                continue
            related.append(row)
        else:
            if in_stock_only and stock <= 0:
                continue
            matches.append(row)

    if tokens or spec_hints:
        priority = exact + close
        remaining = max(limit - min(len(priority), 5), 3)
        results = priority[:5] + related[:remaining]
        if not results:
            results = matches[:limit]
        return results[:limit]

    return (matches or related)[:limit]


def is_contact_priced(listing: VendorProduct) -> bool:
    return (listing.price_mode or "fixed") == "contact"


def _listing_price_key(listing: VendorProduct) -> tuple:
    """Priced listings win over contact-for-price ones, then cheapest first."""
    return (is_contact_priced(listing), listing.price or 0)


def product_to_catalog_dict(
    db: Session,
    product: Product,
    *,
    in_stock_only: bool = False,
    require_vendor: bool = True,
    buyer_country: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Attach live vendor price/stock to a catalog product, matching chat search."""
    vendor_filter = [
        VendorProduct.product_id == product.id,
        VendorProduct.is_active == True,
    ]
    if in_stock_only:
        vendor_filter.append(VendorProduct.stock_quantity > 0)
    vendor_products = [
        listing
        for listing in (
            db.query(VendorProduct)
            .join(Vendor, Vendor.id == VendorProduct.vendor_id)
            .filter(and_(*vendor_filter, Vendor.verification_status == VerificationStatus.VERIFIED))
            .all()
        )
        if visible_in(buyer_country, product.category, listing.delivery_mode, vendor_country(listing.vendor))
    ]
    if not vendor_products:
        if require_vendor or in_stock_only:
            return None
        return {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "category": product.category,
            "description": product.description,
            "specifications": product.specifications or {},
            "base_price": product.base_price,
            "price": product.base_price or 0,
            "stock": 0,
            "vendor_id": None,
            "vendor_product_id": None,
            "image_url": product.image_url,
            "image_urls": list(product.image_urls or []) if product.image_urls else ([product.image_url] if product.image_url else []),
            "available_vendors": 0,
            "vendor_name": None,
            "vendor_phone": None,
            "vendor_domain": None,
            "created_at": product.created_at.isoformat() if product.created_at else None,
            "updated_at": product.updated_at.isoformat() if product.updated_at else None,
        }

    available = [item for item in vendor_products if item.stock_quantity > 0]
    best = min(available or vendor_products, key=_listing_price_key)
    vendor = best.vendor
    contact = is_contact_priced(best)
    image_urls = list(product.image_urls or []) if product.image_urls else ([product.image_url] if product.image_url else [])
    return {
        "id": product.id,
        "name": product.name,
        "sku": product.sku,
        "category": product.category,
        "description": product.description,
        "specifications": product.specifications or {},
        "base_price": product.base_price,
        "price": None if contact else best.price,
        "price_mode": "contact" if contact else "fixed",
        "contact_for_price": contact,
        "delivery_mode": best.delivery_mode,
        "availability_scope": availability_scope(product.category, best.delivery_mode),
        "vendor_country": vendor_country(vendor),
        "stock": best.stock_quantity,
        "vendor_id": best.vendor_id,
        "vendor_product_id": best.id,
        "image_url": product.image_url,
        "image_urls": image_urls,
        "available_vendors": len(available) or len(vendor_products),
        "vendor_name": vendor.company_name if vendor else None,
        "vendor_phone": vendor.phone if vendor else None,
        "vendor_domain": vendor.domain if vendor else None,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


def get_product_by_id(db: Session, product_id: int) -> Optional[Product]:
    """Get product by ID."""
    return db.query(Product).filter(Product.id == product_id).first()


def get_catalog_product(db: Session, product_id: int, buyer_country: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Product detail with the same live vendor price and stock chat uses."""
    product = get_product_by_id(db, product_id)
    if not product:
        return None
    return product_to_catalog_dict(db, product, in_stock_only=False, require_vendor=False, buyer_country=buyer_country)


def get_vendor_products_for_product(
    db: Session,
    product_id: int
) -> List[VendorProduct]:
    """Get all vendor products for a specific product."""
    return db.query(VendorProduct).join(Vendor, Vendor.id == VendorProduct.vendor_id).filter(
        and_(
            VendorProduct.product_id == product_id,
            VendorProduct.is_active == True,
            Vendor.verification_status == VerificationStatus.VERIFIED,
        )
    ).all()


def find_alternative_products(
    db: Session,
    unavailable_product_id: int,
    category: Optional[str] = None,
    max_price: Optional[int] = None,
    buyer_country: Optional[str] = None,
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
        vendor_products = db.query(VendorProduct).join(Vendor, Vendor.id == VendorProduct.vendor_id).filter(
            and_(
                VendorProduct.product_id == product.id,
                VendorProduct.is_active == True,
                VendorProduct.stock_quantity > 0,
                Vendor.verification_status == VerificationStatus.VERIFIED,
            )
        ).all()
        vendor_products = [
            vp for vp in vendor_products
            if visible_in(buyer_country, product.category, vp.delivery_mode, vendor_country(vp.vendor))
        ]

        if vendor_products:
            best_vendor_product = min(vendor_products, key=_listing_price_key)
            contact = is_contact_priced(best_vendor_product)

            if max_price is None or contact or best_vendor_product.price <= max_price:
                alternatives.append({
                    "id": product.id,
                    "name": product.name,
                    "sku": product.sku,
                    "category": product.category,
                    "specifications": product.specifications or {},
                    "price": None if contact else best_vendor_product.price,
                    "price_mode": "contact" if contact else "fixed",
                    "contact_for_price": contact,
                    "stock": best_vendor_product.stock_quantity,
                    "vendor_id": best_vendor_product.vendor_id,
                    "vendor_product_id": best_vendor_product.id,
                    "image_url": product.image_url,
                    "image_urls": list(product.image_urls or []) if product.image_urls else ([product.image_url] if product.image_url else []),
                })
    
    # Sort by price (ascending)
    alternatives.sort(key=lambda x: (x["price"] is None, x["price"] or 0))
    return alternatives[:5]  # Return top 5 alternatives



