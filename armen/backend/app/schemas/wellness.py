# ORYX
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WellnessCheckinIn(BaseModel):
    date: date
    # Hooper Index fields (1–7, 1 = best, 7 = worst)
    sleep_quality: int | None = Field(default=None, ge=1, le=7)
    fatigue: int | None = Field(default=None, ge=1, le=7)
    stress: int | None = Field(default=None, ge=1, le=7)
    muscle_soreness: int | None = Field(default=None, ge=1, le=7)
    # Legacy fields (backward compat — not required from new clients)
    mood: int | None = Field(default=None, ge=1, le=5)
    energy: int | None = Field(default=None, ge=1, le=5)
    soreness: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = None


class WellnessCheckinOut(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    # Hooper Index fields
    sleep_quality: int | None
    fatigue: int | None
    stress: int | None
    muscle_soreness: int | None
    # Legacy fields
    mood: int | None
    energy: int | None
    soreness: int | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
