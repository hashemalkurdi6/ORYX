# ORYX
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class HevyWorkoutOut(BaseModel):
    id: UUID
    hevy_workout_id: str
    title: str
    started_at: datetime
    duration_seconds: int | None
    exercises: list
    volume_kg: float | None
    autopsy_text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class HevyConnectIn(BaseModel):
    api_key: str


class HevySyncResponse(BaseModel):
    synced: int
    total: int
