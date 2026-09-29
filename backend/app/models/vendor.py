from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from ..core.database import Base


class VerificationStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    company_name = Column(String, nullable=False)
    business_registration_number = Column(String, nullable=True)
    domain = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    country = Column(String, default="NG")  # ISO alpha-2; where this vendor's listings originate
    
    # Personal Information for Verification
    personal_name = Column(String, nullable=True)
    id_type = Column(String, nullable=True)  # e.g., "National ID", "Passport", "Driver's License"
    id_number = Column(String, nullable=True)
    id_document_url = Column(String, nullable=True)  # URL to uploaded ID document
    
    # Business Address Verification
    business_address = Column(Text, nullable=True)
    address_verification_bill_url = Column(String, nullable=True)  # URL to utility bill or proof of address
    
    # Company Certificate
    company_certificate_url = Column(String, nullable=True)  # URL to company registration certificate

    # Tax / VAT compliance. VAT may only be charged when vat_status == "approved"
    # and both documents are on file with an unexpired tax clearance.
    tin = Column(String, nullable=True)
    vat_certificate_url = Column(String, nullable=True)
    tax_clearance_url = Column(String, nullable=True)
    tax_clearance_expires_at = Column(DateTime, nullable=True)
    vat_status = Column(String, nullable=False, default="none")  # none | pending | approved | rejected
    vat_review_notes = Column(Text, nullable=True)
    vat_reviewed_at = Column(DateTime, nullable=True)
    vat_reviewed_by = Column(String, nullable=True)
    
    verification_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    verification_notes = Column(Text, nullable=True)
    terms_accepted_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String, nullable=True)
    verification_revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="vendor")
    vendor_products = relationship("VendorProduct", back_populates="vendor", cascade="all, delete-orphan")
    advice = relationship(
        "VendorAdvice",
        back_populates="vendor",
        cascade="all, delete-orphan",
        order_by="VendorAdvice.created_at.desc()",
    )


class VendorAdvice(Base):
    __tablename__ = "vendor_advice"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    vendor_product_id = Column(Integer, ForeignKey("vendor_products.id"), nullable=True, index=True)
    message = Column(Text, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="advice")
    vendor_product = relationship("VendorProduct", back_populates="advice")



