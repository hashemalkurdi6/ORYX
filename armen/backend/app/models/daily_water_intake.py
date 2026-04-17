# ORYX
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DailyWaterIntake(Base):
    __tablename__ = "daily_water_intake"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # Legacy — kept for migration; use amount_ml going forward
    glasses_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # New fields
    amount_ml: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    container_size_ml: Mapped[int] = mapped_column(Integer, nullable=False, default=250)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
