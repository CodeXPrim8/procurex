from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
import json


def coalesce_image_urls(image_url: Optional[str], image_urls: Optional[List[str]]) -> List[str]:
    raw: Any = image_urls
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            raw = parsed if isinstance(parsed, list) else []
        except Exception:
            raw = []
    if not isinstance(raw, list):
        raw = []
    urls: List[str] = []
    for item in raw:
        if isinstance(item, str) and item.strip() and item.strip() not in urls:
            urls.append(item.strip())
    cover = (image_url or "").strip()
    if cover and cover not in urls:
        urls.insert(0, cover)
    return urls


class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    category: str
    description: Optional[str] = None
    specifications: Optional[Dict[str, Any]] = None
    base_price: Optional[int] = None
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None


class ProductResponse(BaseModel):
    id: int
    name: str
    sku: str
    category: str
    description: Optional[str] = None
    specifications: Optional[Dict[str, Any]] = None
    base_price: Optional[int] = None
    image_url: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    price: Optional[int] = None
    price_mode: str = "fixed"
    contact_for_price: bool = False
    delivery_mode: Optional[str] = None
    availability_scope: Optional[str] = None
    vendor_country: Optional[str] = None
    stock: int = 0
    vendor_id: Optional[int] = None
    vendor_product_id: Optional[int] = None
    vendor_name: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_domain: Optional[str] = None
    available_vendors: int = 0

    class Config:
        from_attributes = True

    @field_validator("image_urls", mode="before")
    @classmethod
    def coerce_image_urls(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, list) else []
            except Exception:
                return []
        return value

    @model_validator(mode="after")
    def normalize_images(self):
        urls = coalesce_image_urls(self.image_url, self.image_urls)
        self.image_urls = urls
        self.image_url = urls[0] if urls else self.image_url
        return self


class ProductSearch(BaseModel):
    query: str = ""
    category: Optional[str] = None
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    in_stock_only: bool = False
    brand: Optional[str] = None
    buyer_country: Optional[str] = None  # ISO alpha-2; None shows every region
    spec_hints: Optional[Dict[str, str]] = None
    buyer_bias: Optional[Dict[str, Any]] = None


class VendorProductCreate(BaseModel):
    product_id: int
    stock_quantity: int = 0
    price: int = 0  # Price in cents; ignored when price_mode is "contact"
    price_mode: str = "fixed"
    delivery_mode: Optional[str] = None  # services only: "remote" | "onsite"


class VendorProductResponse(BaseModel):
    id: int
    vendor_id: int
    product_id: int
    stock_quantity: int
    price: int
    price_mode: str = "fixed"
    delivery_mode: Optional[str] = None
    last_verified: datetime
    is_active: bool
    admin_assessment: str = "pending"
    admin_assessment_notes: Optional[str] = None
    admin_assessed_at: Optional[datetime] = None
    admin_assessed_by: Optional[str] = None
    product: Optional[ProductResponse] = None

    class Config:
        from_attributes = True

    @field_validator("price_mode", mode="before")
    @classmethod
    def default_price_mode(cls, value):
        return value or "fixed"
