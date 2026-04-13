from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.user_activity import UserActivity
from app.routers.auth import get_current_user
from app.schemas.user_activity import (
    ActivityStatsOut,
    HeatmapEntryOut,
    UserActivityIn,
    UserActivityOut,
)
from app.services.claude_service import generate_activity_autopsy

router = APIRouter(prefix="/activities", tags=["activities"])

# MET values: {activity_type: {intensity: MET}}
MET_TABLE: dict[str, dict[str, float]] = {
    "Run": {"Easy": 6.0, "Moderate": 8.5, "Hard": 11.0, "Max": 14.0},
    "Running": {"Easy": 6.0, "Moderate": 8.5, "Hard": 11.0, "Max": 14.0},
    "Cycling": {"Easy": 4.0, "Moderate": 6.5, "Hard": 9.0, "Max": 12.0},
    "Swimming": {"Easy": 5.0, "Moderate": 7.0, "Hard": 9.5, "Max": 12.0},
    "Strength": {"Easy": 4.0, "Moderate": 5.5, "Hard": 7.0, "Max": 9.0},
    "CrossFit": {"Easy": 5.0, "Moderate": 7.0, "Hard": 9.0, "Max": 12.0},
    "HIIT": {"Easy": 6.0, "Moderate": 8.0, "Hard": 10.0, "Max": 13.0},
    "MMA": {"Easy": 6.5, "Moderate": 9.0, "Hard": 12.0, "Max": 14.0},
    "Boxing": {"Easy": 6.0, "Moderate": 8.5, "Hard": 11.0, "Max": 13.0},
    "BJJ": {"Easy": 5.5, "Moderate": 8.0, "Hard": 10.5, "Max": 13.0},
    "Soccer": {"Easy": 5.0, "Moderate": 7.5, "Hard": 10.0, "Max": 12.0},
    "Basketball": {"Easy": 4.5, "Moderate": 7.0, "Hard": 9.0, "Max": 11.0},
    "Yoga": {"Easy": 2.5, "Moderate": 3.5, "Hard": 4.5, "Max": 6.0},
    "Workout": {"Easy": 4.0, "Moderate": 5.5, "Hard": 7.0, "Max": 9.0},
    "Sport Training": {"Easy": 5.0, "Moderate": 6.5, "Hard": 8.5, "Max": 11.0},
}
DEFAULT_MET: dict[str, float] = {"Easy": 4.5, "Moderate": 6.0, "Hard": 8.0, "Max": 10.0}


def _compute_calories(activity_type: str, intensity: str, duration_minutes: int, weight_kg: float) -> float:
    met_values = MET_TABLE.get(activity_type, DEFAULT_MET)
    met = met_values.get(intensity, DEFAULT_MET.get(intensity, 6.0))
    return met * weight_kg * (duration_minutes / 60.0)


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=ActivityStatsOut)
async def get_activity_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Total workouts
    count_result = await db.execute(
        select(func.count()).where(UserActivity.user_id == current_user.id)
    )
    total_workouts = count_result.scalar() or 0

    # Total hours
    hours_result = await db.execute(
        select(func.sum(UserActivity.duration_minutes))
        .where(UserActivity.user_id == current_user.id)
    )
    total_minutes = hours_result.scalar() or 0
    total_hours = round(total_minutes / 60.0, 1)

    # Get all distinct activity dates (descending)
    date_col = cast(UserActivity.logged_at, Date)
    dates_result = await db.execute(
        select(date_col.label("d"))
        .where(UserActivity.user_id == current_user.id)
        .group_by(date_col)
        .order_by(date_col.desc())
    )
    dates = [row.d for row in dates_result]

    # Current streak
    current_streak = 0
    if dates:
        today = date.today()
        check = today
        for d in dates:
            if d == check or d == check - timedelta(days=1):
                if d < check:
                    check = d
                current_streak += 1
                check = d - timedelta(days=1)
            else:
                break

    # Longest streak
    longest_streak = 0
    if dates:
        sorted_dates = sorted(dates)
        streak = 1
        best = 1
        for i in range(1, len(sorted_dates)):
            if sorted_dates[i] - sorted_dates[i - 1] == timedelta(days=1):
                streak += 1
                best = max(best, streak)
            else:
                streak = 1
        longest_streak = best

    return ActivityStatsOut(
        total_workouts=total_workouts,
        total_hours=total_hours,
        current_streak=current_streak,
        longest_streak=longest_streak,
    )


# ── Heatmap ────────────────────────────────────────────────────────────────────

@router.get("/heatmap", response_model=list[HeatmapEntryOut])
async def get_activity_heatmap(
    days: int = 84,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_type
    start_date = date_type.today() - timedelta(days=days)
    date_col = cast(UserActivity.logged_at, Date)

    result = await db.execute(
        select(
            date_col.label("d"),
            func.count().label("count"),
            func.sum(UserActivity.duration_minutes).label("total_minutes"),
        )
        .where(
            UserActivity.user_id == current_user.id,
            date_col >= start_date,
        )
        .group_by(date_col)
        .order_by(date_col)
    )

    return [
        HeatmapEntryOut(date=str(row.d), count=row.count, total_minutes=int(row.total_minutes or 0))
        for row in result
    ]


# ── Log Activity ───────────────────────────────────────────────────────────────

@router.post("/", response_model=UserActivityOut, status_code=status.HTTP_201_CREATED)
async def log_activity(
    payload: UserActivityIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    weight_kg = current_user.weight_kg if current_user.weight_kg is not None else 75.0
    calories = _compute_calories(
        payload.activity_type, payload.intensity, payload.duration_minutes, weight_kg
    )

    activity = UserActivity(
        user_id=current_user.id,
        activity_type=payload.activity_type,
        duration_minutes=payload.duration_minutes,
        intensity=payload.intensity,
        notes=payload.notes,
        calories_burned=calories,
        exercise_data=payload.exercise_data,
        distance_meters=payload.distance_meters,
        sport_category=payload.sport_category,
        muscle_groups=payload.muscle_groups,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)

    # Generate autopsy inline (Haiku is fast)
    try:
        autopsy = await generate_activity_autopsy(
            activity_type=payload.activity_type,
            duration_minutes=payload.duration_minutes,
            intensity=payload.intensity,
            calories=calories,
            notes=payload.notes,
            exercise_data=payload.exercise_data,
        )
        activity.autopsy_text = autopsy
        await db.commit()
        await db.refresh(activity)
    except Exception:
        pass

    return activity


# ── List Activities ────────────────────────────────────────────────────────────

@router.get("/", response_model=list[UserActivityOut])
async def list_activities(
    sport_category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(UserActivity)
        .where(UserActivity.user_id == current_user.id)
    )
    if sport_category:
        stmt = stmt.where(UserActivity.sport_category == sport_category)
    stmt = stmt.order_by(UserActivity.logged_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


# ── Delete Activity ────────────────────────────────────────────────────────────

@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserActivity).where(
            UserActivity.id == activity_id,
            UserActivity.user_id == current_user.id,
        )
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    await db.delete(activity)
    await db.commit()
