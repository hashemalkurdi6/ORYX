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
    rpe: Optional[int] = None


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
    rpe: Optional[int] = None
    training_load: Optional[int] = None
    is_rest_day: bool = False
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


class RPEUpdate(BaseModel):
    rpe: int = Field(..., ge=1, le=10)


class WeeklyLoadOut(BaseModel):
    this_week_load: int
    last_week_load: int
    four_week_average: float
    percentage_change: float
    status: str  # "normal" | "elevated" | "high"
    acwr: float | None
    acwr_status: str  # "undertraining" | "optimal" | "caution" | "high_risk" | "insufficient_data"
    days_until_acwr: int | None = None  # days remaining until ACWR unlocks (None when already unlocked)


class ReadinessOut(BaseModel):
    score: int
    label: str
    color: str  # "green" | "amber" | "red"
    explanation: str


class RestDayOut(BaseModel):
    id: UUID
    user_id: UUID
    activity_type: str
    duration_minutes: int
    intensity: str
    notes: Optional[str]
    calories_burned: Optional[float]
    autopsy_text: Optional[str]
    exercise_data: Optional[list]
    distance_meters: Optional[float]
    sport_category: Optional[str]
    muscle_groups: Optional[list]
    rpe: Optional[int]
    training_load: Optional[int]
    is_rest_day: bool
    logged_at: datetime
    created_at: datetime
    model_config = {"from_attributes": True}
