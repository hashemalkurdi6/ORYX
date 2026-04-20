import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base


class RateLimitEvent(Base):
    """One row per request against a rate-limited endpoint.

    `key` is an arbitrary string like "login:1.2.3.4" or "meal_plan:user-uuid".
    Sliding window counts are computed by counting rows where
    created_at >= now - window. Rows older than 24h are garbage-collected opportunistically.
    """

    __tablename__ = "rate_limit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(128), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
