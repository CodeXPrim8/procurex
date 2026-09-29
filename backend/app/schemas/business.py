from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


QUOTE_TEMPLATES = ("classic", "modern", "compact")


class BusinessCreate(BaseModel):
    name: str
    legal_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    template_kind: Optional[str] = "classic"
    vat_percent: Optional[float] = 7.5
    footer_note: Optional[str] = None
    is_default: Optional[bool] = False


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    template_kind: Optional[str] = None
    vat_percent: Optional[float] = None
    footer_note: Optional[str] = None
    is_default: Optional[bool] = None


class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class RequestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    client_id: Optional[int] = None
    status: Optional[str] = "open"


class RequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    client_id: Optional[int] = None
    status: Optional[str] = None


class ClientOut(BaseModel):
    id: int
    business_id: int
    name: str
    email: Optional[str]
    phone: Optional[str]
    company: Optional[str]
    address: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RequestOut(BaseModel):
    id: int
    business_id: int
    client_id: Optional[int]
    title: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    client: Optional[ClientOut] = None

    class Config:
        from_attributes = True


class BusinessOut(BaseModel):
    id: int
    user_id: int
    name: str
    legal_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    logo_url: Optional[str]
    letterhead_url: Optional[str]
    template_kind: Optional[str]
    vat_percent: Optional[float] = None
    footer_note: Optional[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime
    clients: List[ClientOut] = []
    requests: List[RequestOut] = []

    class Config:
        from_attributes = True
