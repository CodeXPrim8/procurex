import httpx
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from ..models.user import UserRole
from ..models.vendor import Vendor, VerificationStatus
from ..models.product import Product, VendorProduct
from ..schemas.vendor import VendorCreate, VendorUpdate


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
    """Verify vendor information and update status."""
    verification_results = {
        "domain_verified": False,
        "notes": []
    }
    
    # Verify domain (non-blocking - don't fail registration if domain check fails)
    if vendor.domain:
        try:
            verification_results["domain_verified"] = verify_vendor_domain(vendor.domain)
            if not verification_results["domain_verified"]:
                verification_results["notes"].append("Domain verification failed")
        except Exception as e:
            # Don't fail registration if domain verification fails
            verification_results["notes"].append(f"Domain verification skipped: {str(e)}")
    
    if vendor.business_registration_number:
        # In production, integrate with business registration APIs
        verification_results["notes"].append("Business registration number provided")
    
    # Determine overall status
    if verification_results["domain_verified"] and vendor.business_registration_number:
        vendor.verification_status = VerificationStatus.VERIFIED
        verification_results["status"] = "verified"
    elif verification_results["domain_verified"] or vendor.business_registration_number:
        vendor.verification_status = VerificationStatus.PENDING
        verification_results["status"] = "pending"
    else:
        vendor.verification_status = VerificationStatus.PENDING
        verification_results["status"] = "pending"
        verification_results["notes"].append("Additional verification required")
    
    vendor.verification_notes = "; ".join(verification_results["notes"]) if verification_results["notes"] else None
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
        domain=metadata.get("domain") or None,
        phone=metadata.get("phone") or None,
        address=metadata.get("address") or None,
        verification_status=VerificationStatus.PENDING,
    )
    db.add(vendor)
    user.role = UserRole.VENDOR
    db.commit()
    db.refresh(vendor)
    return vendor


def create_vendor(db: Session, vendor_data: VendorCreate, user_id: int) -> Vendor:
    """Create a new vendor."""
    try:
        return _create_vendor(db, vendor_data, user_id)
    except OperationalError as exc:
        if "no such column" not in str(exc).lower():
            raise
        _heal_vendor_schema(db)
        return _create_vendor(db, vendor_data, user_id)


def _create_vendor(db: Session, vendor_data: VendorCreate, user_id: int) -> Vendor:
    """Create a new vendor."""
    vendor = Vendor(
        user_id=user_id,
        company_name=vendor_data.company_name,
        business_registration_number=vendor_data.business_registration_number,
        domain=vendor_data.domain,
        phone=vendor_data.phone,
        address=vendor_data.address,
        personal_name=vendor_data.personal_name,
        id_type=vendor_data.id_type,
        id_number=vendor_data.id_number,
        id_document_url=vendor_data.id_document_url,
        business_address=vendor_data.business_address,
        address_verification_bill_url=vendor_data.address_verification_bill_url,
        company_certificate_url=vendor_data.company_certificate_url
    )
    
    # Perform initial verification
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
    
    if vendor_data.company_name is not None:
        vendor.company_name = vendor_data.company_name
    if vendor_data.business_registration_number is not None:
        vendor.business_registration_number = vendor_data.business_registration_number
    if vendor_data.domain is not None:
        vendor.domain = vendor_data.domain
    if vendor_data.phone is not None:
        vendor.phone = vendor_data.phone
    if vendor_data.address is not None:
        vendor.address = vendor_data.address
    
    # Update verification fields
    if vendor_data.personal_name is not None:
        vendor.personal_name = vendor_data.personal_name
    if vendor_data.id_type is not None:
        vendor.id_type = vendor_data.id_type
    if vendor_data.id_number is not None:
        vendor.id_number = vendor_data.id_number
    if vendor_data.id_document_url is not None:
        vendor.id_document_url = vendor_data.id_document_url
    if vendor_data.business_address is not None:
        vendor.business_address = vendor_data.business_address
    if vendor_data.address_verification_bill_url is not None:
        vendor.address_verification_bill_url = vendor_data.address_verification_bill_url
    if vendor_data.company_certificate_url is not None:
        vendor.company_certificate_url = vendor_data.company_certificate_url
    
    # Re-verify if domain or registration number changed
    if vendor_data.domain or vendor_data.business_registration_number:
        verify_vendor(vendor)
    
    db.commit()
    db.refresh(vendor)
    return vendor


def add_vendor_product(
    db: Session,
    vendor_id: int,
    product_id: int,
    stock_quantity: int,
    price: int
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
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing
    
    vendor_product = VendorProduct(
        vendor_id=vendor_id,
        product_id=product_id,
        stock_quantity=stock_quantity,
        price=price
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
    
    vendor_product.stock_quantity = stock_quantity
    if stock_quantity == 0:
        vendor_product.is_active = False
    
    db.commit()
    db.refresh(vendor_product)
    return vendor_product



