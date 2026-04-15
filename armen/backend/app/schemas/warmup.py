from typing import Optional
from pydantic import BaseModel


class WarmUpExercise(BaseModel):
    name: str
    detail: str            # e.g. "2 x 10" or "90 seconds"
    note: Optional[str] = None   # Personalization reason, e.g. "Added for hip soreness"


class WarmUpPhase(BaseModel):
    phase: str             # "General Cardio" | "Mobility" | "Activation" | "Ramp-Up Sets"
    exercises: list[WarmUpExercise]


class WarmUpProtocol(BaseModel):
    summary: str           # 1–2 sentence description of why this warm-up is structured this way
    duration_minutes: int
    phases: list[WarmUpPhase]


class WarmUpRequest(BaseModel):
    muscle_groups: list[str]                        # e.g. ["quads", "glutes", "hamstrings"]
    session_type: str                               # e.g. "Strength — Lower Body"
    sleep_score: Optional[float] = None            # 0–100 or 1–5 normalized
    soreness: Optional[int] = None                 # 1–5 from wellness check-in
    energy: Optional[int] = None                   # 1–5 from wellness check-in
    recent_muscle_work: Optional[dict] = None      # muscle -> days_since_last_trained
