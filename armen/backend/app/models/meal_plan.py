import uuid
from datetime import date, datetime
from sqlalchemy import String, DateTime, Date, JSON, Boolean, Integer, Float, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class MealPlan(Base):
    __tablename__ = "meal_plans"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_meal_plans_user_date"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    plan_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    total_calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_protein: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_carbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    is_cheat_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    regeneration_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    modifications: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

class SavedMeal(Base):
    __tablename__ = "saved_meals"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    meal_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ingredients: Mapped[list | None] = mapped_column(JSON, nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protein_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prep_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
