"""Vendor KYC rules so unverified sellers cannot reach buyers."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable, List, Optional

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from ..models.vendor import Vendor, VerificationStatus

ID_TYPES = (
    "National ID (NIN)",
    "International Passport",
    "Driver's License",
    "Voter's Card",
)

DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "sharklasers.com",
    "grr.la",
    "yopmail.com",
    "tempmail.com",
    "tempmailo.com",
    "10minutemail.com",
    "trashmail.com",
    "discard.email",
    "getnada.com",
    "moakt.com",
    "emailondeck.com",
    "fakeinbox.com",
    "maildrop.cc",
    "mailnesia.com",
}

PLACEHOLDER_COMPANIES = {
    "test",
    "testing",
    "company",
    "my company",
    "vendor",
    "business",
    "abc",
    "asdf",
    "n/a",
    "na",
    "none",
}

DOC_FIELDS = {
    "id_document": "Government ID",
    "address_bill": "Proof of business address",
    "company_certificate": "CAC / company certificate",
    "vat_certificate": "VAT registration certificate",
    "tax_clearance": "Tax clearance certificate (TCC)",
}

VAT_DOC_TYPES = {"vat_certificate", "tax_clearance"}
VAT_STATUSES = {"none", "pending", "approved", "rejected"}

LISTING_BLOCKED_DETAIL = (
    "Your vendor account must be verified before you can list products. "
    "Complete identity checks and wait for ProcureX review."
)


def normalize_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_domain(value: Optional[str]) -> str:
    text = normalize_text(value).lower()
    text = re.sub(r"^https?://", "", text)
    text = text.split("/")[0]
    text = text.split(":")[0]
    if text.startswith("www."):
        text = text[4:]
    return text


def normalize_reg_number(value: Optional[str]) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize_text(value).upper())


def normalize_id_number(value: Optional[str]) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize_text(value).upper())


def normalize_ng_phone(value: Optional[str]) -> Optional[str]:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("234") and len(digits) == 13:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"+234{digits[1:]}"
    if len(digits) == 10:
        return f"+234{digits}"
    return None


def email_domain(email: Optional[str]) -> str:
    text = (email or "").strip().lower()
    if "@" not in text:
        return ""
    return text.rsplit("@", 1)[-1]


def is_disposable_email(email: Optional[str]) -> bool:
    return email_domain(email) in DISPOSABLE_EMAIL_DOMAINS


def validate_company_name(value: Optional[str]) -> Optional[str]:
    name = normalize_text(value)
    if len(name) < 3:
        return "Enter the registered company or business name."
    if name.lower() in PLACEHOLDER_COMPANIES:
        return "Use your real registered business name."
    if not re.search(r"[A-Za-z]", name):
        return "Company name must include letters."
    return None


def validate_registration_number(value: Optional[str]) -> Optional[str]:
    raw = normalize_text(value)
    compact = normalize_reg_number(value)
    if len(compact) < 6:
        return "Enter a valid CAC / business registration number (RC, BN, or IT)."
    if not re.search(r"\d{4,}", compact):
        return "Registration number looks incomplete."
    if not re.match(r"^(RC|BN|IT)?[A-Z0-9]{5,}$", compact):
        return "Enter a CAC number such as RC123456 or BN1234567."
    if raw.lower() in {"123456", "000000", "n/a", "na", "test"}:
        return "Enter the real CAC / registration number, not a placeholder."
    return None


def validate_phone(value: Optional[str]) -> Optional[str]:
    if not normalize_ng_phone(value):
        return "Enter a valid Nigerian business phone number."
    return None


def validate_address(value: Optional[str]) -> Optional[str]:
    text = normalize_text(value)
    if len(text) < 12:
        return "Enter a full business address, including street and city."
    if not re.search(r"[A-Za-z]", text):
        return "Business address must include letters."
    return None


def validate_person_name(value: Optional[str]) -> Optional[str]:
    name = normalize_text(value)
    parts = [part for part in name.split(" ") if part]
    if len(name) < 4 or len(parts) < 2:
        return "Enter the full name of the authorized officer."
    return None


def validate_id(id_type: Optional[str], id_number: Optional[str]) -> Optional[str]:
    kind = normalize_text(id_type)
    if kind not in ID_TYPES:
        return "Select a valid government ID type."
    number = normalize_id_number(id_number)
    if kind.startswith("National ID") and not re.fullmatch(r"\d{11}", number):
        return "NIN must be 11 digits."
    if len(number) < 6:
        return "Enter the ID number exactly as it appears on the document."
    return None


def identity_errors(
    *,
    company_name: Optional[str],
    business_registration_number: Optional[str],
    phone: Optional[str],
    address: Optional[str],
    personal_name: Optional[str],
    id_type: Optional[str],
    id_number: Optional[str],
    terms_accepted: bool,
    email: Optional[str] = None,
) -> List[str]:
    errors: List[str] = []
    if email and is_disposable_email(email):
        errors.append("Use a durable work email. Temporary inboxes are not allowed for vendors.")
    for message in (
        validate_company_name(company_name),
        validate_registration_number(business_registration_number),
        validate_phone(phone),
        validate_address(address),
        validate_person_name(personal_name),
        validate_id(id_type, id_number),
    ):
        if message:
            errors.append(message)
    if not terms_accepted:
        errors.append("Confirm that the business details are true and you are authorized to sell on ProcureX.")
    return errors


def missing_requirements(vendor: Vendor) -> List[str]:
    missing: List[str] = []
    checks = [
        (validate_company_name(vendor.company_name), "Registered company name"),
        (validate_registration_number(vendor.business_registration_number), "CAC / registration number"),
        (validate_phone(vendor.phone), "Business phone"),
        (validate_address(vendor.business_address or vendor.address), "Business address"),
        (validate_person_name(vendor.personal_name), "Authorized officer name"),
        (validate_id(vendor.id_type, vendor.id_number), "Government ID"),
        (None if vendor.id_document_url else "missing", "Government ID document"),
        (None if vendor.company_certificate_url else "missing", "CAC / company certificate"),
        (None if vendor.address_verification_bill_url else "missing", "Proof of business address"),
        (None if vendor.terms_accepted_at else "missing", "Seller declaration"),
    ]
    for failed, label in checks:
        if failed:
            missing.append(label)
    return missing


def is_revoked(vendor: Optional[Vendor]) -> bool:
    return bool(vendor and getattr(vendor, "verification_revoked_at", None))


def can_list_products(vendor: Optional[Vendor]) -> bool:
    return bool(vendor and vendor.verification_status == VerificationStatus.VERIFIED and not is_revoked(vendor))


def validate_tin(value: Optional[str]) -> Optional[str]:
    digits = re.sub(r"\D", "", value or "")
    if not 8 <= len(digits) <= 13:
        return "Enter a valid Tax Identification Number (8 to 13 digits)."
    if len(set(digits)) == 1:
        return "Enter the real TIN, not a placeholder."
    return None


def normalize_tin(value: Optional[str]) -> str:
    return re.sub(r"\D", "", value or "")


def vat_status_of(vendor: Optional[Vendor]) -> str:
    status = (getattr(vendor, "vat_status", None) or "none").strip().lower()
    return status if status in VAT_STATUSES else "none"


def tax_clearance_expired(vendor: Optional[Vendor]) -> bool:
    expires = getattr(vendor, "tax_clearance_expires_at", None)
    return bool(expires and expires < datetime.utcnow())


def vat_missing_requirements(vendor: Vendor) -> List[str]:
    missing: List[str] = []
    if validate_tin(vendor.tin):
        missing.append("Tax Identification Number (TIN)")
    if not vendor.vat_certificate_url:
        missing.append("VAT registration certificate")
    if not vendor.tax_clearance_url:
        missing.append("Tax clearance certificate")
    if not vendor.tax_clearance_expires_at:
        missing.append("Tax clearance expiry date")
    elif tax_clearance_expired(vendor):
        missing.append("A current (unexpired) tax clearance certificate")
    return missing


def can_charge_vat(vendor: Optional[Vendor]) -> bool:
    if not vendor:
        return False
    return (
        vat_status_of(vendor) == "approved"
        and bool(vendor.vat_certificate_url)
        and bool(vendor.tax_clearance_url)
        and not tax_clearance_expired(vendor)
    )


def apply_vat_details(vendor: Vendor, tin: Optional[str], expires_at: Optional[datetime]) -> None:
    """Update TIN / TCC expiry. Any change to an approved VAT profile sends it back to review."""
    changed = False
    if tin is not None:
        error = validate_tin(tin)
        if error:
            raise ValueError(error)
        new_tin = normalize_tin(tin)
        if new_tin != (vendor.tin or ""):
            vendor.tin = new_tin
            changed = True
    if expires_at is not None:
        naive = expires_at.replace(tzinfo=None) if expires_at.tzinfo else expires_at
        if naive != vendor.tax_clearance_expires_at:
            vendor.tax_clearance_expires_at = naive
            changed = True
    if changed:
        refresh_vat_status(vendor)


def refresh_vat_status(vendor: Vendor) -> None:
    """Call after any VAT detail changes: complete profiles go (back) to review, incomplete ones stop VAT."""
    if vat_missing_requirements(vendor):
        if vat_status_of(vendor) in {"pending", "approved"}:
            vendor.vat_status = "none"
        return
    vendor.vat_status = "pending"
    vendor.vat_reviewed_at = None
    vendor.vat_reviewed_by = None


def effective_vat_rate(vendor: Optional[Vendor]) -> float:
    from ..core.config import settings

    return float(settings.VAT_RATE) if can_charge_vat(vendor) else 0.0


def vat_payload(vendor: Vendor) -> dict:
    status = vat_status_of(vendor)
    charging = can_charge_vat(vendor)
    missing = vat_missing_requirements(vendor)
    if charging:
        message = "VAT registered. Invoices and quotes include VAT."
    elif status == "approved" and tax_clearance_expired(vendor):
        message = "Your tax clearance has expired. Upload a current TCC to keep charging VAT."
    elif status == "pending":
        message = "VAT documents are in review. You cannot charge VAT until ProcureX approves them."
    elif status == "rejected":
        message = vendor.vat_review_notes or "VAT documents were rejected. Fix and resubmit."
    else:
        message = "Not VAT registered. Upload your VAT certificate and tax clearance to charge VAT."
    from ..core.config import settings

    return {
        "tin": vendor.tin,
        "vat_certificate_url": vendor.vat_certificate_url,
        "tax_clearance_url": vendor.tax_clearance_url,
        "tax_clearance_expires_at": vendor.tax_clearance_expires_at,
        "vat_status": status,
        "vat_review_notes": vendor.vat_review_notes,
        "vat_reviewed_at": vendor.vat_reviewed_at,
        "can_charge_vat": charging,
        "vat_rate": float(settings.VAT_RATE) if charging else 0.0,
        "vat_missing_requirements": missing,
        "vat_message": message,
    }


def _rel_loaded(obj: Vendor, name: str) -> bool:
    try:
        return name not in sa_inspect(obj).unloaded
    except Exception:
        return True


def serialize_vendor(vendor: Vendor) -> dict:
    extra = onboarding_payload(vendor)
    return {
        "id": vendor.id,
        "user_id": vendor.user_id,
        "company_name": vendor.company_name,
        "business_registration_number": vendor.business_registration_number,
        "domain": vendor.domain,
        "phone": vendor.phone,
        "address": vendor.address,
        "country": getattr(vendor, "country", None) or "NG",
        "personal_name": vendor.personal_name,
        "id_type": vendor.id_type,
        "id_number": vendor.id_number,
        "id_document_url": vendor.id_document_url,
        "business_address": vendor.business_address,
        "address_verification_bill_url": vendor.address_verification_bill_url,
        "company_certificate_url": vendor.company_certificate_url,
        "verification_status": (
            vendor.verification_status.value
            if getattr(vendor.verification_status, "value", None)
            else str(vendor.verification_status or "pending").split(".")[-1].lower()
        ),
        "verification_notes": vendor.verification_notes,
        "terms_accepted_at": vendor.terms_accepted_at,
        "submitted_at": vendor.submitted_at,
        "reviewed_at": vendor.reviewed_at,
        "reviewed_by": vendor.reviewed_by,
        "revoked": is_revoked(vendor),
        "created_at": vendor.created_at,
        "updated_at": vendor.updated_at,
        "product_count": len(vendor.vendor_products or []) if _rel_loaded(vendor, "vendor_products") else 0,
        "admin_advice": serialize_vendor_advice(vendor) if _rel_loaded(vendor, "advice") else [],
        **vat_payload(vendor),
        **extra,
    }


def serialize_vendor_advice(vendor: Vendor) -> list:
    names = {}
    for listing in getattr(vendor, "vendor_products", []) or []:
        product = getattr(listing, "product", None)
        names[listing.id] = product.name if product else None
    items = list(getattr(vendor, "advice", []) or [])
    items.sort(key=lambda item: item.created_at or datetime.min, reverse=True)
    return [
        {
            "id": item.id,
            "message": item.message,
            "vendor_product_id": item.vendor_product_id,
            "product_name": names.get(item.vendor_product_id) if item.vendor_product_id else None,
            "created_by": item.created_by,
            "created_at": item.created_at,
        }
        for item in items
    ]


def onboarding_complete(vendor: Vendor) -> bool:
    return not missing_requirements(vendor)


def onboarding_payload(vendor: Vendor) -> dict:
    missing = missing_requirements(vendor)
    verified = can_list_products(vendor)
    submitted = bool(vendor.submitted_at) and vendor.verification_status == VerificationStatus.PENDING
    revoked = is_revoked(vendor)
    if verified:
        next_step = "Verified. You can list products for buyers."
    elif revoked:
        next_step = vendor.verification_notes or "Verification was revoked. Your listings are hidden from buyers."
    elif vendor.verification_status == VerificationStatus.REJECTED:
        next_step = vendor.verification_notes or "Application was rejected. Fix the notes and resubmit."
    elif submitted:
        next_step = "Documents are in review. Listing stays locked until ProcureX approves this account."
    elif missing:
        next_step = f"Complete: {missing[0]}."
    else:
        next_step = "Submit the application for ProcureX review."
    return {
        "can_list_products": verified,
        "onboarding_complete": not missing,
        "submitted": submitted,
        "missing_requirements": missing,
        "next_step": next_step,
    }


def find_duplicate_vendor(
    db: Session,
    *,
    business_registration_number: Optional[str],
    phone: Optional[str],
    id_number: Optional[str],
    domain: Optional[str],
    exclude_id: Optional[int] = None,
) -> Optional[str]:
    query = db.query(Vendor)
    if exclude_id is not None:
        query = query.filter(Vendor.id != exclude_id)
    vendors: Iterable[Vendor] = query.all()
    wanted_reg = normalize_reg_number(business_registration_number)
    wanted_phone = normalize_ng_phone(phone)
    wanted_id = normalize_id_number(id_number)
    wanted_domain = normalize_domain(domain)
    for other in vendors:
        if wanted_reg and normalize_reg_number(other.business_registration_number) == wanted_reg:
            return "That CAC / registration number is already linked to another vendor."
        if wanted_phone and normalize_ng_phone(other.phone) == wanted_phone:
            return "That phone number is already linked to another vendor."
        if wanted_id and normalize_id_number(other.id_number) == wanted_id:
            return "That ID number is already linked to another vendor."
        if wanted_domain and normalize_domain(other.domain) == wanted_domain:
            return "That website is already linked to another vendor."
    return None


def identity_changed(vendor: Vendor, **fields: Optional[str]) -> bool:
    mapping = {
        "company_name": normalize_text(vendor.company_name),
        "business_registration_number": normalize_reg_number(vendor.business_registration_number),
        "phone": normalize_ng_phone(vendor.phone) or "",
        "personal_name": normalize_text(vendor.personal_name),
        "id_type": normalize_text(vendor.id_type),
        "id_number": normalize_id_number(vendor.id_number),
        "address": normalize_text(vendor.business_address or vendor.address),
    }
    incoming = {
        "company_name": normalize_text(fields.get("company_name")) if fields.get("company_name") is not None else mapping["company_name"],
        "business_registration_number": (
            normalize_reg_number(fields.get("business_registration_number"))
            if fields.get("business_registration_number") is not None
            else mapping["business_registration_number"]
        ),
        "phone": (
            normalize_ng_phone(fields.get("phone")) or ""
            if fields.get("phone") is not None
            else mapping["phone"]
        ),
        "personal_name": normalize_text(fields.get("personal_name")) if fields.get("personal_name") is not None else mapping["personal_name"],
        "id_type": normalize_text(fields.get("id_type")) if fields.get("id_type") is not None else mapping["id_type"],
        "id_number": normalize_id_number(fields.get("id_number")) if fields.get("id_number") is not None else mapping["id_number"],
        "address": (
            normalize_text(fields.get("address") or fields.get("business_address"))
            if fields.get("address") is not None or fields.get("business_address") is not None
            else mapping["address"]
        ),
    }
    return mapping != incoming


def mark_needs_review(vendor: Vendor, reason: str) -> None:
    if vendor.verification_status == VerificationStatus.VERIFIED:
        vendor.verification_notes = reason
    vendor.verification_status = VerificationStatus.PENDING
    vendor.submitted_at = None
    vendor.reviewed_at = None
    vendor.reviewed_by = None


def accept_terms(vendor: Vendor) -> None:
    vendor.terms_accepted_at = datetime.utcnow()
