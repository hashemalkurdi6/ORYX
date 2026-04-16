import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Text, Float, ForeignKey, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserActivity(Base):
    __tablename__ = "user_activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    intensity: Mapped[str] = mapped_column(String(32), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    calories_burned: Mapped[float | None] = mapped_column(Float, nullable=True)
    autopsy_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Extended fields
    exercise_data: Mapped[list | None] = mapped_column(JSON, nullable=True)
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    sport_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    muscle_groups: Mapped[list | None] = mapped_column(JSON, nullable=True)
    rpe: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_load: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_rest_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default='false')
    logged_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
