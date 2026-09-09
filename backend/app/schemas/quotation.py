from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class QuotationItemCreate(BaseModel):
    product_id: int
    vendor_product_id: Optional[int] = None
    quantity: int
    unit_price: Decimal
    specifications: Optional[dict] = None


class QuotationCreate(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    items: List[QuotationItemCreate]
    notes: Optional[str] = None


class QuotationItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    specifications: Optional[dict]

    class Config:
        from_attributes = True


class QuotationResponse(BaseModel):
    id: int
    user_id: int
    quotation_number: str
    customer_name: str
    customer_email: str
    customer_phone: Optional[str]
    customer_address: Optional[str]
    total_amount: Decimal
    status: str
    notes: Optional[str]
    pdf_url: Optional[str]
    items: List[QuotationItemResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True



