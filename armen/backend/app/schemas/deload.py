from typing import Literal
from pydantic import BaseModel


class SignalScore(BaseModel):
    """Result from a single deload signal analyzer."""
    score: float           # 0–100: how strongly this signal points toward a deload
    label: str             # Human-readable name of the signal
    explanation: str       # Plain-language explanation shown in the UI
    data_available: bool   # False when there's not enough data to score this signal


class DeloadRecommendation(BaseModel):
    """Full deload recommendation returned to the mobile app."""
    overall_score: float
    recommendation: Literal["none", "consider", "recommended", "urgent"]
    confidence: Literal["low", "medium", "high"]
    primary_reason: str             # The top reason, shown on the summary card
    signals: list[SignalScore]      # Per-signal breakdown for the detail modal
    suggested_duration_days: int    # 5 or 7 days
    data_days: int                  # How many days of data were analyzed
    analysis_date: str              # ISO date string (YYYY-MM-DD)
