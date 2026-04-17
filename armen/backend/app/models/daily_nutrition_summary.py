# ORYX — DailyNutritionSummary model
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DailyNutritionSummary(Base):
    """Running daily nutrition totals per user per date. Composite PK (user_id, date)."""

    __tablename__ = "daily_nutrition_summaries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[date] = mapped_column(Date, primary_key=True)

    calories_consumed: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    protein_consumed_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    carbs_consumed_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fat_consumed_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fibre_consumed_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sugar_consumed_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sodium_consumed_mg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    vitamin_d_consumed_iu: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    magnesium_consumed_mg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    iron_consumed_mg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    calcium_consumed_mg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    zinc_consumed_mg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    omega3_consumed_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
