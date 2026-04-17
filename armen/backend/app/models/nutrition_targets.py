# ORYX — NutritionTargets model
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NutritionTargets(Base):
    """One row per user — all macro + micronutrient targets."""

    __tablename__ = "nutrition_targets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # ── Macro targets ──────────────────────────────────────────────────────────
    daily_calorie_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protein_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fibre_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugar_max_g: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Micronutrient targets ──────────────────────────────────────────────────
    sodium_max_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    potassium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    calcium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    iron_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    vitamin_d_iu: Mapped[float | None] = mapped_column(Float, nullable=True)
    magnesium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    zinc_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    omega3_g: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Carb cycling ───────────────────────────────────────────────────────────
    is_carb_cycling: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    training_day_carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    rest_day_carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Intermittent fasting flag ──────────────────────────────────────────────
    is_intermittent_fasting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── Hydration target ───────────────────────────────────────────────────────
    water_target_ml: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Meta ───────────────────────────────────────────────────────────────────
    calculated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
