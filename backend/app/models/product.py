from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    category = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    specifications = Column(JSON, nullable=True)  # Store as JSON: {"ram": "16GB", "storage": "512GB", etc.}
    base_price = Column(Integer, nullable=True)  # Price in cents
    image_url = Column(String, nullable=True)
    image_urls = Column(JSON, nullable=True)  # Extra product photos: ["/uploads/...", ...]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    vendor_products = relationship("VendorProduct", back_populates="product", cascade="all, delete-orphan")


class VendorProduct(Base):
    __tablename__ = "vendor_products"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    stock_quantity = Column(Integer, default=0)
    price = Column(Integer, nullable=False)  # Price in cents; 0 when price_mode is "contact"
    price_mode = Column(String, default="fixed")  # "fixed" | "contact" (software/service only)
    delivery_mode = Column(String, nullable=True)  # services: "remote" (worldwide) | "onsite" (vendor country)
    unit_cost = Column(Float, nullable=True)  # BisonBook default cost price (NGN)
    last_verified = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    admin_assessment = Column(String, default="pending")
    admin_assessment_notes = Column(Text, nullable=True)
    admin_assessed_at = Column(DateTime, nullable=True)
    admin_assessed_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    vendor = relationship("Vendor", back_populates="vendor_products")
    product = relationship("Product", back_populates="vendor_products")
    advice = relationship("VendorAdvice", back_populates="vendor_product")



