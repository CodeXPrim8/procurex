from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Literal
from datetime import datetime
from decimal import Decimal


class QuotationItemCreate(BaseModel):
    product_id: Optional[int] = None
    vendor_product_id: Optional[int] = None
    product_name: Optional[str] = None
    quantity: int
    unit_price: Decimal
    cost_price: Optional[Decimal] = None
    profit_percent: Optional[Decimal] = None
    specifications: Optional[dict] = None
    vendor: Optional[dict] = None


class QuotationCreate(BaseModel):
    customer_name: str
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    recipient_emails: Optional[List[EmailStr]] = None
    cc_emails: Optional[List[EmailStr]] = None
    business_id: Optional[int] = None
    client_id: Optional[int] = None
    request_id: Optional[int] = None
    template_kind: Optional[str] = None
    vat_percent: Optional[Decimal] = None
    valid_days: Optional[int] = Field(default=None, ge=1, le=365)
    profit_percent: Optional[Decimal] = None
    items: List[QuotationItemCreate]
    notes: Optional[str] = None


class QuotationItemUpdate(BaseModel):
    id: Optional[int] = None
    product_id: Optional[int] = None
    vendor_product_id: Optional[int] = None
    product_name: Optional[str] = None
    quantity: int = Field(..., ge=1, le=100000)
    unit_price: Decimal
    cost_price: Optional[Decimal] = None
    profit_percent: Optional[Decimal] = None
    specifications: Optional[dict] = None
    vendor: Optional[dict] = None


class QuotationUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    recipient_emails: Optional[List[EmailStr]] = None
    cc_emails: Optional[List[EmailStr]] = None
    business_id: Optional[int] = None
    client_id: Optional[int] = None
    request_id: Optional[int] = None
    template_kind: Optional[str] = None
    vat_percent: Optional[Decimal] = None
    valid_days: Optional[int] = Field(default=None, ge=1, le=365)
    profit_percent: Optional[Decimal] = None
    notes: Optional[str] = None
    items: Optional[List[QuotationItemUpdate]] = None


class QuotationSend(BaseModel):
    to: Optional[List[EmailStr]] = None
    cc: Optional[List[EmailStr]] = None


class QuotationConvert(BaseModel):
    kind: Literal["invoice", "receipt"]


class QuotationItemResponse(BaseModel):
    id: int
    product_id: Optional[int]
    vendor_product_id: Optional[int] = None
    product_name: str
    quantity: int
    cost_price: Optional[Decimal] = None
    profit_percent: Optional[Decimal] = None
    unit_price: Decimal
    total_price: Decimal
    specifications: Optional[dict]
    vendor: Optional[Any] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True


class QuotationResponse(BaseModel):
    id: int
    user_id: int
    business_id: Optional[int] = None
    client_id: Optional[int] = None
    request_id: Optional[int] = None
    quotation_number: str
    source_number: Optional[str] = None
    document_kind: str = "quote"
    paid_at: Optional[datetime] = None
    customer_name: str
    customer_email: Optional[str]
    customer_phone: Optional[str]
    customer_address: Optional[str]
    recipient_emails: Optional[List[str]] = None
    cc_emails: Optional[List[str]] = None
    template_kind: Optional[str] = None
    vat_percent: Optional[Decimal] = None
    vat_amount: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None
    valid_days: Optional[int] = None
    profit_percent: Optional[Decimal] = None
    total_amount: Decimal
    status: str
    notes: Optional[str]
    pdf_url: Optional[str]
    items: List[QuotationItemResponse]
    item_name: Optional[str] = None
    quantity: Optional[int] = None
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    business_name: Optional[str] = None
    client_name: Optional[str] = None
    vendor_name: Optional[str] = None

    class Config:
        from_attributes = True
