from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, model_validator


def format_pace(seconds_per_km: float | None) -> str:
    """Convert seconds per km to a human-readable string like '5:23 /km'."""
    if seconds_per_km is None:
        return "N/A"
    minutes = int(seconds_per_km // 60)
    seconds = int(seconds_per_km % 60)
    return f"{minutes}:{seconds:02d} /km"


class ActivityOut(BaseModel):
    id: UUID
    user_id: UUID
    strava_id: int
    name: str
    sport_type: str
    start_date: datetime
    distance_meters: float | None
    elapsed_time_seconds: int
    moving_time_seconds: int
    avg_heart_rate: float | None
    max_heart_rate: float | None
    avg_pace_seconds_per_km: float | None
    total_elevation_gain: float | None
    autopsy_text: str | None
    autopsy_generated_at: datetime | None
    created_at: datetime
    pace_per_km_str: str = "N/A"

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def compute_pace_str(cls, values):
        if hasattr(values, "avg_pace_seconds_per_km"):
            pace = values.avg_pace_seconds_per_km
        elif isinstance(values, dict):
            pace = values.get("avg_pace_seconds_per_km")
        else:
            pace = None
        pace_str = format_pace(pace)
        if isinstance(values, dict):
            values["pace_per_km_str"] = pace_str
        else:
            try:
                object.__setattr__(values, "pace_per_km_str", pace_str)
            except AttributeError:
                pass
        return values


class ActivityList(BaseModel):
    activities: list[ActivityOut]
    total: int
