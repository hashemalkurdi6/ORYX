# ORYX
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class WhoopDataOut(BaseModel):
    id: UUID
    user_id: UUID
    date: date
    recovery_score: float | None
    hrv_rmssd: float | None
    resting_heart_rate: float | None
    sleep_performance_pct: float | None
    strain_score: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
