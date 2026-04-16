import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, JSON, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class NutritionProfile(Base):
    __tablename__ = "nutrition_profiles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    cuisines_liked: Mapped[list | None] = mapped_column(JSON, nullable=True)
    foods_loved: Mapped[list | None] = mapped_column(JSON, nullable=True)
    foods_disliked: Mapped[list | None] = mapped_column(JSON, nullable=True)
    foods_hated: Mapped[str | None] = mapped_column(Text, nullable=True)
    diet_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    allergies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    nutrition_goal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    strictness_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cheat_day_preference: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sugar_preference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    carb_approach: Mapped[str | None] = mapped_column(String(100), nullable=True)
    intermittent_fasting: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fasting_start_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    fasting_end_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    meals_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eats_breakfast: Mapped[str | None] = mapped_column(String(30), nullable=True)
    meal_times: Mapped[list | None] = mapped_column(JSON, nullable=True)
    pre_workout_nutrition: Mapped[str | None] = mapped_column(String(100), nullable=True)
    post_workout_nutrition: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meal_prep: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cooking_skill: Mapped[str | None] = mapped_column(String(50), nullable=True)
    time_per_meal: Mapped[str | None] = mapped_column(String(50), nullable=True)
    weekly_budget: Mapped[str | None] = mapped_column(String(50), nullable=True)
    kitchen_access: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nutrition_survey_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
