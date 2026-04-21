# ORYX
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class HevyPR(BaseModel):
    """A personal-record earned in this workout.

    kind:
      - "max_weight": new heaviest single-rep weight for this exercise
      - "1rm":        new best Epley-estimated 1RM (weight * (1 + reps/30))
      - "max_reps":   new max reps at the previous best weight or higher
    """
    exercise: str
    kind: str
    value: float
    unit: str = "kg"
    reps: int | None = None
    weight: float | None = None


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
    prs: list[HevyPR] = []

    model_config = {"from_attributes": True}


class HevyConnectIn(BaseModel):
    api_key: str


class HevySyncResponse(BaseModel):
    synced: int
    total: int
