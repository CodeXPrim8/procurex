from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    business_id = Column(Integer, ForeignKey("buyer_businesses.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("business_clients.id"), nullable=True, index=True)
    request_id = Column(Integer, ForeignKey("client_requests.id"), nullable=True, index=True)
    quotation_number = Column(String, unique=True, nullable=False, index=True)
    source_number = Column(String, nullable=True)
    document_kind = Column(String, default="quote")  # quote, invoice, receipt
    paid_at = Column(DateTime, nullable=True)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(Text, nullable=True)
    recipient_emails = Column(JSON, nullable=True)
    cc_emails = Column(JSON, nullable=True)
    template_kind = Column(String, nullable=True)
    vat_percent = Column(Numeric(8, 2), nullable=True)
    valid_days = Column(Integer, nullable=True)
    profit_percent = Column(Numeric(8, 2), nullable=True)
    total_amount = Column(Numeric(14, 2), nullable=False)
    status = Column(String, default="draft")  # draft, sent, accepted, rejected
    notes = Column(Text, nullable=True)
    pdf_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="quotations")
    business = relationship("BuyerBusiness", back_populates="quotations")
    client = relationship("BusinessClient", back_populates="quotations")
    request = relationship("ClientRequest", back_populates="quotations")
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    vendor_product_id = Column(Integer, ForeignKey("vendor_products.id"), nullable=True)
    product_name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    cost_price = Column(Numeric(14, 2), nullable=True)
    profit_percent = Column(Numeric(8, 2), nullable=True)
    unit_price = Column(Numeric(14, 2), nullable=False)
    total_price = Column(Numeric(14, 2), nullable=False)
    specifications = Column(JSON, nullable=True)
    vendor = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    quotation = relationship("Quotation", back_populates="items")



