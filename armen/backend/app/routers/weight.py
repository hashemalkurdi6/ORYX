# ORYX — Weight tracking router
import logging
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import cast, Date, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.weight_log import WeightLog
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/weight", tags=["weight"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class WeightLogIn(BaseModel):
    weight_kg: float
    note: str | None = None
    logged_at: str | None = None  # ISO date string YYYY-MM-DD; defaults to today

    @field_validator("weight_kg")
    @classmethod
    def validate_weight(cls, v: float) -> float:
        if v < 30 or v > 300:
            raise ValueError("Weight must be between 30 and 300 kg")
        return round(v, 2)


class WeightSettingsIn(BaseModel):
    weight_unit: Literal["kg", "lbs"] | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _linear_regression_slope(xs: list[float], ys: list[float]) -> float:
    """Returns slope (y units per x unit) of a simple linear regression."""
    n = len(xs)
    if n < 2:
        return 0.0
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    numerator = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    denominator = sum((xs[i] - mean_x) ** 2 for i in range(n))
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _rolling_avg(values: list[float], window: int) -> list[float]:
    """7-day rolling average."""
    result: list[float] = []
    for i in range(len(values)):
        start = max(0, i - window + 1)
        chunk = values[start : i + 1]
        result.append(round(sum(chunk) / len(chunk), 2))
    return result


def _compute_goal_alignment(
    rate_per_week: float,
    primary_goal: str | None,
) -> str:
    """Return 'on_track' | 'off_track' | 'neutral' based on trend vs. goal."""
    goal = (primary_goal or "").lower()
    losing = rate_per_week < -0.05   # losing > 50g/week
    gaining = rate_per_week > 0.05   # gaining > 50g/week

    if any(k in goal for k in ["fat", "loss", "cut", "lose", "lean"]):
        return "on_track" if losing else "off_track"
    if any(k in goal for k in ["muscle", "gain", "bulk", "build", "mass"]):
        return "on_track" if gaining else "off_track"
    return "neutral"


def _compute_streak(log_dates: list[date]) -> int:
    """Consecutive days ending today (or yesterday) with a log."""
    if not log_dates:
        return 0
    date_set = set(log_dates)
    today = date.today()
    streak = 0
    check = today
    for _ in range(366):
        if check in date_set:
            streak += 1
            check -= timedelta(days=1)
        elif check == today:
            # Allow yesterday to start streak
            check -= timedelta(days=1)
            if check in date_set:
                streak += 1
                check -= timedelta(days=1)
            else:
                break
        else:
            break
    return streak


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/log")
async def log_weight(
    body: WeightLogIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upsert today's weight log (one entry per day)."""
    if body.logged_at:
        try:
            log_date = date.fromisoformat(body.logged_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format — use YYYY-MM-DD")
    else:
        log_date = date.today()

    log_dt = datetime.combine(log_date, datetime.min.time().replace(hour=8))

    # Upsert: if a log already exists for this user+date, update it
    date_col = cast(WeightLog.logged_at, Date)
    existing_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
            date_col == log_date,
        )
    )
    existing = existing_res.scalar_one_or_none()

    if existing:
        existing.weight_kg = body.weight_kg
        existing.note = body.note
        existing.logged_at = log_dt
        entry = existing
    else:
        entry = WeightLog(
            user_id=current_user.id,
            weight_kg=body.weight_kg,
            logged_at=log_dt,
            note=body.note,
            source="manual",
        )
        db.add(entry)

    # Also update users.weight_kg to the latest value
    current_user.weight_kg = body.weight_kg
    await db.flush()

    unit = getattr(current_user, "weight_unit", "kg") or "kg"
    display = round(body.weight_kg * 2.20462, 1) if unit == "lbs" else body.weight_kg

    return {
        "id": str(entry.id),
        "weight_kg": body.weight_kg,
        "display_value": display,
        "display_unit": unit,
        "logged_at": entry.logged_at.isoformat(),
        "note": entry.note,
    }


_RANGE_DAYS: dict[str, int | None] = {
    "7d": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365, "all": None,
}


@router.get("/history")
async def get_weight_history(
    days: int = Query(default=30, ge=7, le=365),
    time_range: str | None = Query(default=None, alias="range"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return daily weight logs, rolling average, weekly averages, and trend rate."""
    date_col = cast(WeightLog.logged_at, Date)

    # time_range param overrides days if provided
    effective_days: int | None = days
    if time_range is not None:
        key = time_range.lower()
        if key in _RANGE_DAYS:
            effective_days = _RANGE_DAYS[key]

    today = date.today()
    since = today - timedelta(days=effective_days) if effective_days is not None else None

    query = select(WeightLog).where(WeightLog.user_id == current_user.id)
    if since is not None:
        query = query.where(date_col >= since)
    query = query.order_by(WeightLog.logged_at.asc())

    logs_res = await db.execute(query)
    logs = logs_res.scalars().all()

    # If range requested has no data, fall back to all available
    fell_back = False
    if since is not None and not logs:
        fell_back = True
        all_res = await db.execute(
            select(WeightLog).where(
                WeightLog.user_id == current_user.id,
            ).order_by(WeightLog.logged_at.asc())
        )
        logs = all_res.scalars().all()

    unit = getattr(current_user, "weight_unit", "kg") or "kg"
    factor = 2.20462 if unit == "lbs" else 1.0

    # Daily entries
    entries = [
        {
            "date": entry.logged_at.date().isoformat(),
            "weight_kg": entry.weight_kg,
            "display_value": round(entry.weight_kg * factor, 1),
            "note": entry.note,
        }
        for entry in logs
    ]

    if not entries:
        return {
            "entries": [],
            "rolling_avg": [],
            "weekly_averages": [],
            "rate_of_change_kg_per_week": None,
            "display_unit": unit,
            "days_with_data": 0,
            "fell_back_to_all": False,
            "first_log_date": None,
        }

    first_log_date = entries[0]["date"]

    # Rolling window: 3 for 7d range, 7 otherwise
    rolling_window = 3 if (time_range or "").lower() == "7d" else 7
    raw_weights = [e["weight_kg"] for e in entries]
    rolling = _rolling_avg(raw_weights, rolling_window)
    n = len(entries)
    rolling_entries = [
        {"date": entries[i]["date"], "rolling_avg": round(rolling[i] * factor, 2)}
        for i in range(n)
    ]

    # Weekly averages (group by ISO week)
    from collections import defaultdict
    week_buckets: dict[str, list[float]] = defaultdict(list)
    for entry in entries:
        d = date.fromisoformat(entry["date"])
        week_key = (d - timedelta(days=d.weekday())).isoformat()
        week_buckets[week_key].append(entry["weight_kg"])
    weekly_averages = [
        {
            "week_start": wk,
            "avg_kg": round(sum(vals) / len(vals), 2),
            "display_avg": round(sum(vals) / len(vals) * factor, 2),
            "count": len(vals),
        }
        for wk, vals in sorted(week_buckets.items())
    ]

    # Linear regression slope → kg/week
    xs = list(range(n))
    slope_per_day = _linear_regression_slope(xs, raw_weights)
    rate_per_week = round(slope_per_day * 7, 3)

    return {
        "entries": entries,
        "rolling_avg": rolling_entries,
        "weekly_averages": weekly_averages,
        "rate_of_change_kg_per_week": rate_per_week,
        "display_unit": unit,
        "days_with_data": n,
        "fell_back_to_all": fell_back,
        "first_log_date": first_log_date,
    }


@router.get("/summary")
async def get_weight_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return summary stats: trend, goal alignment, streak, monthly log count."""
    today = date.today()
    since_28 = today - timedelta(days=28)
    since_month_start = today.replace(day=1)
    date_col = cast(WeightLog.logged_at, Date)

    # Last 28 days for trend calculation
    logs_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
            date_col >= since_28,
        ).order_by(WeightLog.logged_at.asc())
    )
    logs_28 = logs_res.scalars().all()

    unit = getattr(current_user, "weight_unit", "kg") or "kg"
    factor = 2.20462 if unit == "lbs" else 1.0

    # Current weight (most recent log)
    latest_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
        ).order_by(WeightLog.logged_at.desc()).limit(1)
    )
    latest = latest_res.scalar_one_or_none()
    current_weight_kg = latest.weight_kg if latest else current_user.weight_kg

    rate_per_week: float | None = None
    weekly_change_kg: float | None = None
    goal_alignment: str | None = None

    # data_confidence based on total all-time logs (computed below — need all_log_dates first)
    # We'll set it after computing all_log_dates

    # Days logged this month
    month_count_res = await db.execute(
        select(func.count(func.distinct(date_col))).where(
            WeightLog.user_id == current_user.id,
            date_col >= since_month_start,
        )
    )
    days_logged_this_month = int(month_count_res.scalar() or 0)

    # All-time log dates for streak + confidence
    all_dates_res = await db.execute(
        select(date_col.label("d")).where(
            WeightLog.user_id == current_user.id,
        ).order_by(date_col.desc())
    )
    all_log_dates = [row.d for row in all_dates_res]
    total_logs = len(all_log_dates)

    # data_confidence: gates goal alignment and rate display
    if total_logs < 3:
        data_confidence = "insufficient"
    elif total_logs < 7:
        data_confidence = "early"
    elif total_logs < 14:
        data_confidence = "limited"
    else:
        data_confidence = "sufficient"

    # Only compute trend when we have enough data
    if len(logs_28) >= 2 and data_confidence in ("limited", "sufficient"):
        xs = list(range(len(logs_28)))
        ys = [log.weight_kg for log in logs_28]
        slope = _linear_regression_slope(xs, ys)
        rate_per_week = round(slope * 7, 3)
        weekly_change_kg = rate_per_week
        goal_alignment = _compute_goal_alignment(rate_per_week, current_user.primary_goal)

    streak = _compute_streak(all_log_dates)

    # Longest streak all-time
    date_set = sorted(set(all_log_dates))
    longest = 0
    current_run = 1
    for i in range(1, len(date_set)):
        if (date_set[i] - date_set[i - 1]).days == 1:
            current_run += 1
            longest = max(longest, current_run)
        else:
            current_run = 1
    if date_set:
        longest = max(longest, 1)

    # Logged today?
    logged_today_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
            date_col == today,
        )
    )
    logged_today = logged_today_res.scalar_one_or_none() is not None

    return {
        "current_weight_kg": current_weight_kg,
        "current_weight_display": round(current_weight_kg * factor, 1) if current_weight_kg else None,
        "display_unit": unit,
        "rate_of_change_kg_per_week": rate_per_week,
        "weekly_change_display": round(weekly_change_kg * factor, 2) if weekly_change_kg is not None else None,
        "goal_alignment": goal_alignment,  # null when insufficient/early
        "data_confidence": data_confidence,
        "days_logged_this_month": days_logged_this_month,
        "current_streak": streak,
        "longest_streak": longest,
        "logged_today": logged_today,
        "total_logs": total_logs,
    }


@router.post("/settings")
async def update_weight_settings(
    body: WeightSettingsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update weight display unit preference."""
    if body.weight_unit is not None:
        current_user.weight_unit = body.weight_unit
    await db.flush()
    return {"weight_unit": getattr(current_user, "weight_unit", "kg")}
