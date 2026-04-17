import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReadinessCache(Base):
    """One readiness result cached per user. Invalidated on new activity, meal, or wellness log."""
    __tablename__ = "readiness_cache"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False)
    primary_factor: Mapped[str] = mapped_column(Text, nullable=False)
    data_confidence: Mapped[str] = mapped_column(String(40), nullable=False)
    components_used: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    breakdown: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    hardware_available: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
