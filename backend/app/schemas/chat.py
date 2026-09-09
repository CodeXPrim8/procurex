from pydantic import BaseModel, model_validator
from typing import Optional, List, Any
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
    metadata: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def use_sqlalchemy_message_metadata(cls, data: Any):
        # ChatMessage.metadata is SQLAlchemy MetaData; the column is message_metadata.
        if not isinstance(data, dict) and hasattr(data, "message_metadata"):
            return {
                "id": data.id,
                "session_id": data.session_id,
                "role": data.role,
                "content": data.content,
                "metadata": data.message_metadata,
                "created_at": data.created_at,
            }
        return data


class ChatSessionCreate(BaseModel):
    title: Optional[str] = None


class ChatSessionSummary(BaseModel):
    id: int
    user_id: int
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatSessionResponse(BaseModel):
    id: int
    user_id: int
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: Optional[List[ChatMessageResponse]] = []

    class Config:
        from_attributes = True
