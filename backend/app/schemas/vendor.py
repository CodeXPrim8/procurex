from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from ..models.vendor import VerificationStatus


class VendorCreate(BaseModel):
    company_name: str
    business_registration_number: str = ""
    phone: str = ""
    address: str = ""
    personal_name: str = ""
    id_type: str = ""
    id_number: str = ""
    terms_accepted: bool = False
    domain: Optional[str] = None
    id_document_url: Optional[str] = None
    business_address: Optional[str] = None
    address_verification_bill_url: Optional[str] = None
    company_certificate_url: Optional[str] = None
    tin: Optional[str] = None
    charge_vat: bool = False
    tax_clearance_expires_at: Optional[datetime] = None


class VendorUpdate(BaseModel):
    company_name: Optional[str] = None
    business_registration_number: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    personal_name: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_document_url: Optional[str] = None
    business_address: Optional[str] = None
    address_verification_bill_url: Optional[str] = None
    company_certificate_url: Optional[str] = None
    terms_accepted: Optional[bool] = None
    tin: Optional[str] = None
    tax_clearance_expires_at: Optional[datetime] = None


class VendorResponse(BaseModel):
    id: int
    user_id: int
    company_name: str
    business_registration_number: Optional[str]
    domain: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    country: Optional[str] = "NG"
    
    # Personal Information for Verification
    personal_name: Optional[str]
    id_type: Optional[str]
    id_number: Optional[str]
    id_document_url: Optional[str]
    
    # Business Address Verification
    business_address: Optional[str]
    address_verification_bill_url: Optional[str]
    
    # Company Certificate
    company_certificate_url: Optional[str]
    
    verification_status: VerificationStatus
    verification_notes: Optional[str]
    terms_accepted_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    revoked: bool = False
    can_list_products: bool = False
    onboarding_complete: bool = False
    submitted: bool = False
    missing_requirements: List[str] = Field(default_factory=list)
    next_step: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    product_count: int = 0
    admin_advice: List["VendorAdviceOut"] = Field(default_factory=list)

    tin: Optional[str] = None
    vat_certificate_url: Optional[str] = None
    tax_clearance_url: Optional[str] = None
    tax_clearance_expires_at: Optional[datetime] = None
    vat_status: str = "none"
    vat_review_notes: Optional[str] = None
    vat_reviewed_at: Optional[datetime] = None
    can_charge_vat: bool = False
    vat_rate: float = 0.0
    vat_missing_requirements: List[str] = Field(default_factory=list)
    vat_message: Optional[str] = None

    class Config:
        from_attributes = True


class VendorReviewIn(BaseModel):
    action: str
    notes: Optional[str] = None


class VendorAdviceOut(BaseModel):
    id: int
    message: str
    vendor_product_id: Optional[int] = None
    product_name: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class VendorAdviceIn(BaseModel):
    message: str
    vendor_product_id: Optional[int] = None


class ProductAssessIn(BaseModel):
    action: str
    notes: Optional[str] = None


class VatReviewIn(BaseModel):
    action: str
    notes: Optional[str] = None


class VatDetailsIn(BaseModel):
    tin: Optional[str] = None
    tax_clearance_expires_at: Optional[datetime] = None


VendorResponse.model_rebuild()



