from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class BuyerBusiness(Base):
    __tablename__ = "buyer_businesses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    legal_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    logo_url = Column(String, nullable=True)
    letterhead_url = Column(String, nullable=True)
    template_kind = Column(String, default="classic")  # classic, modern, compact
    vat_percent = Column(Numeric(8, 2), nullable=True)
    footer_note = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="businesses")
    clients = relationship("BusinessClient", back_populates="business", cascade="all, delete-orphan")
    requests = relationship("ClientRequest", back_populates="business", cascade="all, delete-orphan")
    quotations = relationship("Quotation", back_populates="business")


class BusinessClient(Base):
    __tablename__ = "business_clients"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("buyer_businesses.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    company = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    business = relationship("BuyerBusiness", back_populates="clients")
    requests = relationship("ClientRequest", back_populates="client")
    quotations = relationship("Quotation", back_populates="client")


class ClientRequest(Base):
    __tablename__ = "client_requests"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("buyer_businesses.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("business_clients.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="open")  # open, sourcing, quoted, closed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    business = relationship("BuyerBusiness", back_populates="requests")
    client = relationship("BusinessClient", back_populates="requests")
    quotations = relationship("Quotation", back_populates="request")
