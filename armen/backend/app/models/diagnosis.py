import uuid
from datetime import date, datetime

from sqlalchemy import String, DateTime, Date, Text, JSON, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    diagnosis_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    contributing_factors: Mapped[list | None] = mapped_column(JSON, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    tone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    readiness_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
