from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..core.database import Base


class BuyerMemory(Base):
    """Per-buyer search memory: categories, brands, specs, and listings they keep matching."""

    __tablename__ = "buyer_memories"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    category_counts = Column(JSON, nullable=True)
    brand_counts = Column(JSON, nullable=True)
    spec_counts = Column(JSON, nullable=True)
    product_ids = Column(JSON, nullable=True)
    last_query = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="buyer_memory", uselist=False)
