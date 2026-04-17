# ORYX
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class NutritionLogIn(BaseModel):
    meal_name: str
    description: str | None = None
    calories: int | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fibre_g: float | None = None
    sugar_g: float | None = None
    sodium_mg: float | None = None
    vitamin_d_iu: float | None = None
    magnesium_mg: float | None = None
    iron_mg: float | None = None
    calcium_mg: float | None = None
    zinc_mg: float | None = None
    omega3_g: float | None = None
    meal_type: str | None = None
    source: str | None = None
    notes: str | None = None


class NutritionLogOut(BaseModel):
    id: UUID
    user_id: UUID
    logged_at: datetime
    meal_name: str
    description: str | None
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    fibre_g: float | None
    sugar_g: float | None
    sodium_mg: float | None
    vitamin_d_iu: float | None
    magnesium_mg: float | None
    iron_mg: float | None
    calcium_mg: float | None
    zinc_mg: float | None
    omega3_g: float | None
    meal_type: str | None
    source: str | None
    photo_url: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FoodScanRequest(BaseModel):
    image: str
    media_type: str = "image/jpeg"


class FoodScanResult(BaseModel):
    food_name: str
    description: str
    serving_estimate: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    fibre_g: float
    sugar_g: float = 0.0
    sodium_mg: float = 0.0
    vitamin_d_iu: float = 0.0
    magnesium_mg: float = 0.0
    iron_mg: float = 0.0
    calcium_mg: float = 0.0
    zinc_mg: float = 0.0
    omega3_g: float = 0.0
    confidence: Literal["low", "medium", "high"]
    low_confidence: bool
