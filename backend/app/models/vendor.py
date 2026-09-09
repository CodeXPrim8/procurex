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
    
    verification_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    verification_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="vendor")
    vendor_products = relationship("VendorProduct", back_populates="vendor", cascade="all, delete-orphan")



