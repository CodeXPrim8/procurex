import httpx
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from ..models.user import UserRole
from ..models.vendor import Vendor, VerificationStatus
from ..models.product import Product, VendorProduct
from ..schemas.vendor import VendorCreate, VendorUpdate
from .vendor_onboarding import (
    accept_terms,
    find_duplicate_vendor,
    identity_changed,
    identity_errors,
    mark_needs_review,
    normalize_domain,
    normalize_ng_phone,
    normalize_text,
    normalize_tin,
    validate_tin,
    apply_vat_details,
)


def _heal_vendor_schema(db: Session) -> None:
    db.rollback()
    from ..core.database import migrate_sqlite_schema
    migrate_sqlite_schema()


def verify_vendor_domain(domain: str) -> bool:
    """Verify vendor domain exists and is valid."""
    if not domain:
        return False
    
    try:
        # Remove http/https if present
        domain = domain.replace("http://", "").replace("https://", "").split("/")[0]
        
        # Simple check - in production, use more sophisticated verification
        response = httpx.get(f"https://{domain}", timeout=5, follow_redirects=True)
        return response.status_code == 200
    except Exception:
        return False


def verify_vendor(vendor: Vendor) -> Dict[str, Any]:
    """Collect domain/registration signals. Never auto-approve a seller."""
    verification_results = {
        "domain_verified": False,
        "notes": [],
        "status": vendor.verification_status.value if vendor.verification_status else "pending",
    }

    if vendor.domain:
        try:
            verification_results["domain_verified"] = verify_vendor_domain(vendor.domain)
            if not verification_results["domain_verified"]:
                verification_results["notes"].append("Website did not respond")
        except Exception:
            verification_results["notes"].append("Website check skipped")

    if vendor.business_registration_number:
        verification_results["notes"].append("CAC number provided")

    if vendor.verification_status == VerificationStatus.VERIFIED:
        return verification_results

    extra = "; ".join(verification_results["notes"]) if verification_results["notes"] else None
    if extra and extra not in (vendor.verification_notes or ""):
        vendor.verification_notes = extra
    return verification_results


def ensure_vendor_for_user(
    db: Session,
    user,
    supabase_user: Optional[Dict[str, Any]] = None,
) -> Vendor:
    """Return the user's vendor profile, creating it once from auth metadata if needed."""
    try:
        return _ensure_vendor_for_user(db, user, supabase_user)
    except OperationalError as exc:
        if "no such column" not in str(exc).lower():
            raise
        _heal_vendor_schema(db)
        return _ensure_vendor_for_user(db, user, supabase_user)


def _ensure_vendor_for_user(
    db: Session,
    user,
    supabase_user: Optional[Dict[str, Any]] = None,
) -> Vendor:
    existing = db.query(Vendor).filter(Vendor.user_id == user.id).first()
    if existing:
        return existing

    metadata = (supabase_user or {}).get("user_metadata") or {}
    company_name = (
        str(metadata.get("company_name") or "").strip()
        or str(user.full_name or "").strip()
        or (user.email.split("@")[0] if user.email else "My Company")
    )

    vendor = Vendor(
        user_id=user.id,
        company_name=company_name,
        business_registration_number=metadata.get("business_registration_number") or None,
        domain=normalize_domain(metadata.get("domain")) or None,
        phone=normalize_ng_phone(metadata.get("phone")) or metadata.get("phone") or None,
        address=metadata.get("address") or None,
        personal_name=metadata.get("personal_name") or metadata.get("full_name") or None,
        id_type=metadata.get("id_type") or None,
        id_number=metadata.get("id_number") or None,
        verification_status=VerificationStatus.PENDING,
    )
    db.add(vendor)
    user.role = UserRole.VENDOR
    db.commit()
    db.refresh(vendor)
    return vendor


def create_vendor(db: Session, vendor_data: VendorCreate, user_id: int, email: Optional[str] = None) -> Vendor:
    """Create a new vendor."""
    try:
        return _create_vendor(db, vendor_data, user_id, email)
    except OperationalError as exc:
        if "no such column" not in str(exc).lower():
            raise
        _heal_vendor_schema(db)
        return _create_vendor(db, vendor_data, user_id, email)


def _create_vendor(db: Session, vendor_data: VendorCreate, user_id: int, email: Optional[str] = None) -> Vendor:
    """Create a pending vendor. Listing stays locked until admin review."""
    address = vendor_data.business_address or vendor_data.address
    errors = identity_errors(
        company_name=vendor_data.company_name,
        business_registration_number=vendor_data.business_registration_number,
        phone=vendor_data.phone,
        address=address,
        personal_name=vendor_data.personal_name,
        id_type=vendor_data.id_type,
        id_number=vendor_data.id_number,
        terms_accepted=bool(vendor_data.terms_accepted),
        email=email,
    )
    if errors:
        raise ValueError(errors[0])
    duplicate = find_duplicate_vendor(
        db,
        business_registration_number=vendor_data.business_registration_number,
        phone=vendor_data.phone,
        id_number=vendor_data.id_number,
        domain=vendor_data.domain,
    )
    if duplicate:
        raise ValueError(duplicate)
    if vendor_data.charge_vat or vendor_data.tin:
        tin_error = validate_tin(vendor_data.tin)
        if tin_error:
            raise ValueError(tin_error)

    vendor = Vendor(
        user_id=user_id,
        company_name=normalize_text(vendor_data.company_name),
        business_registration_number=normalize_text(vendor_data.business_registration_number).upper(),
        domain=normalize_domain(vendor_data.domain) or None,
        phone=normalize_ng_phone(vendor_data.phone),
        address=normalize_text(address),
        personal_name=normalize_text(vendor_data.personal_name),
        id_type=normalize_text(vendor_data.id_type),
        id_number=normalize_text(vendor_data.id_number).upper(),
        id_document_url=vendor_data.id_document_url,
        business_address=normalize_text(address),
        address_verification_bill_url=vendor_data.address_verification_bill_url,
        company_certificate_url=vendor_data.company_certificate_url,
        verification_status=VerificationStatus.PENDING,
        tin=normalize_tin(vendor_data.tin) or None,
        tax_clearance_expires_at=vendor_data.tax_clearance_expires_at,
        vat_status="none",
    )
    if vendor_data.terms_accepted:
        accept_terms(vendor)
    verify_vendor(vendor)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


def update_vendor(db: Session, vendor_id: int, vendor_data: VendorUpdate) -> Optional[Vendor]:
    """Update vendor information."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        return None

    next_company = vendor_data.company_name if vendor_data.company_name is not None else vendor.company_name
    next_reg = (
        vendor_data.business_registration_number
        if vendor_data.business_registration_number is not None
        else vendor.business_registration_number
    )
    next_phone = vendor_data.phone if vendor_data.phone is not None else vendor.phone
    next_address = (
        vendor_data.business_address
        if vendor_data.business_address is not None
        else vendor_data.address if vendor_data.address is not None
        else (vendor.business_address or vendor.address)
    )
    next_person = vendor_data.personal_name if vendor_data.personal_name is not None else vendor.personal_name
    next_id_type = vendor_data.id_type if vendor_data.id_type is not None else vendor.id_type
    next_id_number = vendor_data.id_number if vendor_data.id_number is not None else vendor.id_number

    changing_identity = identity_changed(
        vendor,
        company_name=vendor_data.company_name,
        business_registration_number=vendor_data.business_registration_number,
        phone=vendor_data.phone,
        personal_name=vendor_data.personal_name,
        id_type=vendor_data.id_type,
        id_number=vendor_data.id_number,
        address=vendor_data.address,
        business_address=vendor_data.business_address,
    )
    if changing_identity:
        errors = identity_errors(
            company_name=next_company,
            business_registration_number=next_reg,
            phone=next_phone,
            address=next_address,
            personal_name=next_person,
            id_type=next_id_type,
            id_number=next_id_number,
            terms_accepted=True,
        )
        if errors:
            raise ValueError(errors[0])
        duplicate = find_duplicate_vendor(
            db,
            business_registration_number=next_reg,
            phone=next_phone,
            id_number=next_id_number,
            domain=vendor_data.domain if vendor_data.domain is not None else vendor.domain,
            exclude_id=vendor.id,
        )
        if duplicate:
            raise ValueError(duplicate)

    if vendor_data.company_name is not None:
        vendor.company_name = normalize_text(vendor_data.company_name)
    if vendor_data.business_registration_number is not None:
        vendor.business_registration_number = normalize_text(vendor_data.business_registration_number).upper()
    if vendor_data.domain is not None:
        vendor.domain = normalize_domain(vendor_data.domain) or None
    if vendor_data.phone is not None:
        vendor.phone = normalize_ng_phone(vendor_data.phone)
    if vendor_data.address is not None:
        vendor.address = normalize_text(vendor_data.address)
    if vendor_data.personal_name is not None:
        vendor.personal_name = normalize_text(vendor_data.personal_name)
    if vendor_data.id_type is not None:
        vendor.id_type = normalize_text(vendor_data.id_type)
    if vendor_data.id_number is not None:
        vendor.id_number = normalize_text(vendor_data.id_number).upper()
    if vendor_data.id_document_url is not None:
        vendor.id_document_url = vendor_data.id_document_url
    if vendor_data.business_address is not None:
        vendor.business_address = normalize_text(vendor_data.business_address)
        vendor.address = vendor.business_address
    if vendor_data.address_verification_bill_url is not None:
        vendor.address_verification_bill_url = vendor_data.address_verification_bill_url
    if vendor_data.company_certificate_url is not None:
        vendor.company_certificate_url = vendor_data.company_certificate_url
    if vendor_data.terms_accepted:
        accept_terms(vendor)
    apply_vat_details(vendor, vendor_data.tin, vendor_data.tax_clearance_expires_at)

    if changing_identity and vendor.verification_status == VerificationStatus.VERIFIED:
        mark_needs_review(vendor, "Identity details changed. Re-verification is required before listing again.")
    elif changing_identity:
        vendor.submitted_at = None
        if vendor.verification_status == VerificationStatus.REJECTED:
            vendor.verification_status = VerificationStatus.PENDING

    verify_vendor(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


PRICE_MODES = {"fixed", "contact"}
CONTACT_PRICE_CATEGORIES = {"software", "service"}


class PricingError(ValueError):
    pass


def resolve_pricing(category: Optional[str], price_mode: Optional[str], price: Optional[int]) -> tuple[str, int]:
    """Validate a listing's pricing choice. Only software and service listings may hide their price."""
    mode = (price_mode or "fixed").strip().lower()
    if mode not in PRICE_MODES:
        raise PricingError("Pricing must be either a fixed price or contact for price.")
    if mode == "contact":
        if (category or "").strip().lower() not in CONTACT_PRICE_CATEGORIES:
            raise PricingError("Contact for price is only available for software and service listings.")
        return mode, 0
    if not price or price <= 0:
        raise PricingError("Price must be greater than 0.")
    return mode, int(price)


def add_vendor_product(
    db: Session,
    vendor_id: int,
    product_id: int,
    stock_quantity: int,
    price: int,
    price_mode: str = "fixed",
    delivery_mode: Optional[str] = None,
) -> VendorProduct:
    """Add a product to a vendor's catalog."""
    # Check if already exists
    existing = db.query(VendorProduct).filter(
        VendorProduct.vendor_id == vendor_id,
        VendorProduct.product_id == product_id
    ).first()
    
    if existing:
        existing.stock_quantity = stock_quantity
        existing.price = price
        existing.price_mode = price_mode
        existing.delivery_mode = delivery_mode
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing
    
    vendor_product = VendorProduct(
        vendor_id=vendor_id,
        product_id=product_id,
        stock_quantity=stock_quantity,
        price=price,
        price_mode=price_mode,
        delivery_mode=delivery_mode,
    )
    
    db.add(vendor_product)
    db.commit()
    db.refresh(vendor_product)
    return vendor_product


def update_vendor_product_stock(
    db: Session,
    vendor_product_id: int,
    stock_quantity: int
) -> Optional[VendorProduct]:
    """Update stock quantity for a vendor product."""
    vendor_product = db.query(VendorProduct).filter(
        VendorProduct.id == vendor_product_id
    ).first()
    
    if not vendor_product:
        return None

    from .bisonbook.inventory import set_stock_level

    set_stock_level(db, vendor_product.vendor, vendor_product, stock_quantity, created_by="Product form")
    if stock_quantity == 0:
        vendor_product.is_active = False
    
    db.commit()
    db.refresh(vendor_product)
    return vendor_product



