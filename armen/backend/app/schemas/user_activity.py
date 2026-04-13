from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UserActivityIn(BaseModel):
    activity_type: str
    duration_minutes: int = Field(..., ge=1)
    intensity: Literal["Easy", "Moderate", "Hard", "Max"]
    notes: Optional[str] = None
    exercise_data: Optional[list[dict[str, Any]]] = None
    distance_meters: Optional[float] = None
    sport_category: Optional[str] = None
    muscle_groups: Optional[list[str]] = None


class UserActivityOut(BaseModel):
    id: UUID
    user_id: UUID
    activity_type: str
    duration_minutes: int
    intensity: str
    notes: Optional[str]
    calories_burned: Optional[float]
    autopsy_text: Optional[str]
    exercise_data: Optional[list[dict[str, Any]]]
    distance_meters: Optional[float]
    sport_category: Optional[str]
    muscle_groups: Optional[list[str]]
    logged_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityStatsOut(BaseModel):
    total_workouts: int
    total_hours: float
    current_streak: int
    longest_streak: int


class HeatmapEntryOut(BaseModel):
    date: str
    count: int
    total_minutes: int
