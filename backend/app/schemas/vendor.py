from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..models.vendor import VerificationStatus


class VendorCreate(BaseModel):
    company_name: str
    business_registration_number: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    
    # Personal Information for Verification
    personal_name: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_document_url: Optional[str] = None
    
    # Business Address Verification
    business_address: Optional[str] = None
    address_verification_bill_url: Optional[str] = None
    
    # Company Certificate
    company_certificate_url: Optional[str] = None


class VendorUpdate(BaseModel):
    company_name: Optional[str] = None
    business_registration_number: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    
    # Personal Information for Verification
    personal_name: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    id_document_url: Optional[str] = None
    
    # Business Address Verification
    business_address: Optional[str] = None
    address_verification_bill_url: Optional[str] = None
    
    # Company Certificate
    company_certificate_url: Optional[str] = None


class VendorResponse(BaseModel):
    id: int
    user_id: int
    company_name: str
    business_registration_number: Optional[str]
    domain: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    
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
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True



