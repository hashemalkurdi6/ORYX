# ORYX
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DailyStepsIn(BaseModel):
    date: str
    steps: int = Field(..., ge=0)


class DailyStepsOut(BaseModel):
    id: UUID
    user_id: UUID
    date: str
    steps: int
    created_at: datetime

    model_config = {"from_attributes": True}
