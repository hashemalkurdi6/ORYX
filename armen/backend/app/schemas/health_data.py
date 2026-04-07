from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class HealthSnapshotIn(BaseModel):
    date: date
    sleep_duration_hours: float | None = None
    sleep_quality_score: float | None = None
    hrv_ms: float | None = None
    resting_heart_rate: float | None = None
    steps: int | None = None
    active_energy_kcal: float | None = None


class HealthSnapshotOut(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    sleep_duration_hours: float | None
    sleep_quality_score: float | None
    hrv_ms: float | None
    resting_heart_rate: float | None
    steps: int | None
    active_energy_kcal: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthSnapshotBulkIn(BaseModel):
    snapshots: list[HealthSnapshotIn]
