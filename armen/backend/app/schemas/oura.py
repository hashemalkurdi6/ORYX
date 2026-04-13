# ORYX
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class OuraDataOut(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    readiness_score: int | None
    sleep_score: int | None
    hrv_average: float | None
    rem_sleep_minutes: int | None
    deep_sleep_minutes: int | None
    light_sleep_minutes: int | None
    sleep_efficiency: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
