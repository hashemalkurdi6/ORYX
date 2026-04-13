import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Text, Float, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HevyWorkout(Base):
    __tablename__ = "hevy_workouts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    hevy_workout_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercises: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list
    )
    volume_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    autopsy_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    autopsy_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
