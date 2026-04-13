# ORYX
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WellnessCheckinIn(BaseModel):
    date: date
    mood: int = Field(..., ge=1, le=5)
    energy: int = Field(..., ge=1, le=5)
    soreness: int = Field(..., ge=1, le=5)
    notes: str | None = None


class WellnessCheckinOut(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    mood: int
    energy: int
    soreness: int
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
