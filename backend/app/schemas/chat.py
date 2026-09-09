from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..models.chat import MessageRole


class ChatMessageCreate(BaseModel):
    content: str
    role: MessageRole = MessageRole.USER
    metadata: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    role: MessageRole
    content: str
    metadata: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionCreate(BaseModel):
    title: Optional[str] = None


class ChatSessionResponse(BaseModel):
    id: int
    user_id: int
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    messages: Optional[List[ChatMessageResponse]] = []

    class Config:
        from_attributes = True



