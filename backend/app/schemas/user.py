from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from ..models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.BUYER


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    role: UserRole
    created_at: datetime
    country: Optional[str] = None
    preferred_currency: Optional[str] = None

    class Config:
        from_attributes = True


class UserPreferencesIn(BaseModel):
    country: Optional[str] = None
    preferred_currency: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: Optional[str] = None



