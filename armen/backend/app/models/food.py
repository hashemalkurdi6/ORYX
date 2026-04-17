# ORYX
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FoodCache(Base):
    """Cached food items from Open Food Facts or USDA."""
    __tablename__ = "foods_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)   # 'openfoodfacts' | 'usda'
    food_name: Mapped[str] = mapped_column(String(500), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calories_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fibre_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugar_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sodium_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    vitamin_d_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    magnesium_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    iron_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    calcium_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    zinc_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    omega3_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    serving_size_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    serving_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cached_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SearchCache(Base):
    """Cached search query results (24-hour TTL)."""
    __tablename__ = "search_cache"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    query_text: Mapped[str] = mapped_column(String(500), nullable=False)
    results_json: Mapped[str] = mapped_column(Text, nullable=False)   # JSON list of FoodItem dicts
    cached_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class CustomFood(Base):
    """User-created custom food entries."""
    __tablename__ = "custom_foods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_name: Mapped[str] = mapped_column(String(500), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calories_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fibre_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugar_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sodium_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    vitamin_d_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    magnesium_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    iron_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    calcium_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    zinc_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    omega3_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    serving_size_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    serving_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
