from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class ProductCreate(BaseModel):
    name: str
    sku: str
    category: str
    description: Optional[str] = None
    specifications: Optional[Dict[str, Any]] = None
    base_price: Optional[int] = None
    image_url: Optional[str] = None


class ProductResponse(BaseModel):
    id: int
    name: str
    sku: str
    category: str
    description: Optional[str]
    specifications: Optional[Dict[str, Any]]
    base_price: Optional[int]
    image_url: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProductSearch(BaseModel):
    query: str
    category: Optional[str] = None
    min_price: Optional[int] = None
    max_price: Optional[int] = None


class VendorProductCreate(BaseModel):
    product_id: int
    stock_quantity: int = 0
    price: int  # Price in cents


class VendorProductResponse(BaseModel):
    id: int
    vendor_id: int
    product_id: int
    stock_quantity: int
    price: int
    last_verified: datetime
    is_active: bool
    product: Optional[ProductResponse] = None
    vendor: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True



