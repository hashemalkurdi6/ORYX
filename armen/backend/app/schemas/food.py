# ORYX
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class FoodItem(BaseModel):
    """Unified food item returned from search and barcode endpoints."""
    id: str                              # external_id or custom UUID string
    name: str
    brand: str | None = None
    source: Literal["openfoodfacts", "usda", "custom"]
    calories_100g: float = 0.0
    protein_100g: float = 0.0
    carbs_100g: float = 0.0
    fat_100g: float = 0.0
    fibre_100g: float = 0.0
    sugar_100g: float = 0.0
    sodium_100g: float = 0.0            # grams (not mg)
    vitamin_d_100g: float = 0.0         # IU per 100g
    magnesium_100g: float = 0.0         # mg per 100g
    iron_100g: float = 0.0              # mg per 100g
    calcium_100g: float = 0.0           # mg per 100g
    zinc_100g: float = 0.0              # mg per 100g
    omega3_100g: float = 0.0            # g per 100g
    serving_size_g: float | None = None
    serving_unit: str | None = None

    model_config = {"from_attributes": True}


class FoodSearchResponse(BaseModel):
    query: str
    results: list[FoodItem]
    cached: bool = False


class CustomFoodIn(BaseModel):
    food_name: str
    brand: str | None = None
    calories_100g: float = 0.0
    protein_100g: float = 0.0
    carbs_100g: float = 0.0
    fat_100g: float = 0.0
    fibre_100g: float = 0.0
    sugar_100g: float = 0.0
    sodium_100g: float = 0.0
    vitamin_d_100g: float = 0.0
    magnesium_100g: float = 0.0
    iron_100g: float = 0.0
    calcium_100g: float = 0.0
    zinc_100g: float = 0.0
    omega3_100g: float = 0.0
    serving_size_g: float | None = None
    serving_unit: str | None = None


class CustomFoodOut(BaseModel):
    id: str
    user_id: UUID
    food_name: str
    brand: str | None
    calories_100g: float
    protein_100g: float
    carbs_100g: float
    fat_100g: float
    fibre_100g: float
    sugar_100g: float
    sodium_100g: float
    vitamin_d_100g: float
    magnesium_100g: float
    iron_100g: float
    calcium_100g: float
    zinc_100g: float
    omega3_100g: float
    serving_size_g: float | None
    serving_unit: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RecentFoodItem(BaseModel):
    meal_name: str
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    fibre_g: float | None
    last_logged: datetime


class FrequentFoodItem(BaseModel):
    meal_name: str
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    fibre_g: float | None
    log_count: int
