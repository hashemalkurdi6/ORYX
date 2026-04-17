import logging
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
    RPEUpdate,
    UserActivityIn,
    UserActivityOut,
    WeeklyLoadOut,
)
from app.services.claude_service import generate_activity_autopsy

logger = logging.getLogger(__name__)

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

RPE_FROM_INTENSITY = {"Easy": 4, "Moderate": 6, "Hard": 8, "Max": 10}


def _compute_calories(activity_type: str, intensity: str, duration_minutes: int, weight_kg: float) -> float:
    met_values = MET_TABLE.get(activity_type, DEFAULT_MET)
    met = met_values.get(intensity, DEFAULT_MET.get(intensity, 6.0))
    return met * weight_kg * (duration_minutes / 60.0)


def _compute_training_load(duration_minutes: int, rpe: int | None, intensity: str) -> int:
    effective_rpe = rpe if rpe is not None else RPE_FROM_INTENSITY.get(intensity, 6)
    return duration_minutes * effective_rpe


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=ActivityStatsOut)
async def get_activity_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Total workouts (exclude rest days)
    count_result = await db.execute(
        select(func.count()).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day == False,
        )
    )
    total_workouts = count_result.scalar() or 0

    # Total hours (exclude rest days)
    hours_result = await db.execute(
        select(func.sum(UserActivity.duration_minutes))
        .where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day == False,
        )
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


# ── Weekly Load ────────────────────────────────────────────────────────────────

@router.get("/weekly-load", response_model=WeeklyLoadOut)
async def get_weekly_load(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    # Current week: Monday to Sunday
    week_start = today - timedelta(days=today.weekday())
    last_week_start = week_start - timedelta(weeks=1)
    twenty_eight_days_ago = today - timedelta(days=28)
    seven_days_ago = today - timedelta(days=7)

    date_col = cast(UserActivity.logged_at, Date)

    async def sum_load(start: date, end: date) -> int:
        r = await db.execute(
            select(func.coalesce(func.sum(UserActivity.training_load), 0))
            .where(
                UserActivity.user_id == current_user.id,
                date_col >= start,
                date_col < end,
                UserActivity.is_rest_day == False,
            )
        )
        return int(r.scalar() or 0)

    this_week_load = await sum_load(week_start, today + timedelta(days=1))
    last_week_load = await sum_load(last_week_start, week_start)

    # 4-week average (each of 4 complete weeks before this week)
    week_loads = []
    for i in range(4):
        ws = week_start - timedelta(weeks=i + 1)
        we = week_start - timedelta(weeks=i)
        week_loads.append(await sum_load(ws, we))
    four_week_average = sum(week_loads) / 4.0

    # percentage change
    if last_week_load > 0:
        percentage_change = (this_week_load - last_week_load) / last_week_load * 100
    else:
        percentage_change = 0.0

    # status
    if four_week_average > 0 and this_week_load > four_week_average * 1.5:
        status = "high"
    elif four_week_average > 0 and this_week_load > four_week_average * 1.3:
        status = "elevated"
    else:
        status = "normal"

    # ACWR
    acute_load = await sum_load(seven_days_ago, today + timedelta(days=1))

    # Check if user has at least 28 days of data
    oldest_result = await db.execute(
        select(func.min(date_col)).where(UserActivity.user_id == current_user.id)
    )
    oldest_date = oldest_result.scalar()

    acwr = None
    acwr_status = "insufficient_data"
    if oldest_date and (today - oldest_date).days >= 28:
        chronic_load = await sum_load(twenty_eight_days_ago, today + timedelta(days=1))
        chronic_weekly_avg = chronic_load / 4.0
        if chronic_weekly_avg > 0:
            acwr = round(acute_load / chronic_weekly_avg, 2)
            if acwr < 0.8:
                acwr_status = "undertraining"
            elif acwr <= 1.3:
                acwr_status = "optimal"
            elif acwr <= 1.5:
                acwr_status = "caution"
            else:
                acwr_status = "high_risk"
        else:
            acwr_status = "insufficient_data"

    # Compute days until ACWR unlocks (only when still insufficient data)
    days_until_acwr: int | None = None
    if acwr_status == "insufficient_data":
        if oldest_date:
            remaining = 28 - (today - oldest_date).days
            days_until_acwr = max(1, remaining)
        else:
            days_until_acwr = 28

    return WeeklyLoadOut(
        this_week_load=this_week_load,
        last_week_load=last_week_load,
        four_week_average=round(four_week_average, 1),
        percentage_change=round(percentage_change, 1),
        status=status,
        acwr=acwr,
        acwr_status=acwr_status,
        days_until_acwr=days_until_acwr,
    )


# ── Readiness ──────────────────────────────────────────────────────────────────

@router.get("/readiness")
async def get_readiness(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the readiness score via the single shared calculation service."""
    from app.services.readiness_service import calculate_readiness
    return await calculate_readiness(current_user.id, db)


# ── Log Rest Day ───────────────────────────────────────────────────────────────

@router.post("/rest", response_model=UserActivityOut, status_code=201)
async def log_rest_day(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.readiness_service import invalidate_readiness_cache

    # Dedup: return existing rest day if already logged today
    today = date.today()
    existing_result = await db.execute(
        select(UserActivity).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day == True,
            cast(UserActivity.logged_at, Date) == today,
        )
    )
    existing = existing_result.scalars().first()
    if existing:
        return existing

    activity = UserActivity(
        user_id=current_user.id,
        activity_type="Rest Day",
        duration_minutes=0,
        intensity="Easy",
        sport_category="rest",
        is_rest_day=True,
        training_load=0,
    )
    db.add(activity)
    await invalidate_readiness_cache(current_user.id, db)
    await db.commit()
    await db.refresh(activity)
    return activity


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

    rpe = payload.rpe
    training_load = _compute_training_load(payload.duration_minutes, rpe, payload.intensity)

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
        rpe=rpe,
        training_load=training_load,
    )
    from app.services.readiness_service import invalidate_readiness_cache
    db.add(activity)
    await invalidate_readiness_cache(current_user.id, db)
    await db.commit()
    await db.refresh(activity)

    # Generate autopsy inline
    try:
        logger.info(
            "log_activity: generating autopsy for activity %s (%s, %d min, %s)",
            activity.id, payload.activity_type, payload.duration_minutes, payload.intensity,
        )
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
        logger.info("log_activity: autopsy generated successfully for %s", activity.id)
    except Exception as exc:
        logger.exception("log_activity: autopsy generation failed for %s: %s", activity.id, exc)

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


# ── Update RPE ─────────────────────────────────────────────────────────────────

@router.patch("/{activity_id}/rpe", response_model=UserActivityOut)
async def update_activity_rpe(
    activity_id: UUID,
    payload: RPEUpdate,
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
        raise HTTPException(status_code=404, detail="Activity not found")
    activity.rpe = payload.rpe
    activity.training_load = _compute_training_load(activity.duration_minutes, payload.rpe, activity.intensity)
    await db.commit()
    await db.refresh(activity)
    return activity


# ── Retry Autopsy ──────────────────────────────────────────────────────────────

@router.post("/{activity_id}/autopsy", response_model=UserActivityOut)
async def retry_activity_autopsy(
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

    logger.info("retry_autopsy: regenerating for %s", activity_id)
    try:
        autopsy = await generate_activity_autopsy(
            activity_type=activity.activity_type,
            duration_minutes=activity.duration_minutes,
            intensity=activity.intensity,
            calories=activity.calories_burned,
            notes=activity.notes,
            exercise_data=activity.exercise_data,
        )
        activity.autopsy_text = autopsy
        await db.commit()
        await db.refresh(activity)
        logger.info("retry_autopsy: success for %s", activity_id)
    except Exception as exc:
        logger.exception("retry_autopsy: failed for %s: %s", activity_id, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate analysis")

    return activity


# ── Regenerate Stale Autopsies ─────────────────────────────────────────────────

@router.post("/regenerate-autopsies")
async def regenerate_stale_autopsies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate autopsy for manual activities that are missing one (up to 5 at a time)."""
    result = await db.execute(
        select(UserActivity)
        .where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day == False,
            UserActivity.autopsy_text.is_(None),
            UserActivity.sport_category != "rest",
        )
        .order_by(UserActivity.logged_at.desc())
        .limit(5)
    )
    activities = result.scalars().all()
    regenerated = 0
    for activity in activities:
        try:
            autopsy = await generate_activity_autopsy(
                activity_type=activity.activity_type,
                duration_minutes=activity.duration_minutes,
                intensity=activity.intensity,
                calories=activity.calories_burned,
                notes=activity.notes,
                exercise_data=activity.exercise_data,
            )
            activity.autopsy_text = autopsy
            regenerated += 1
        except Exception as exc:
            logger.warning("regenerate_autopsies: failed for %s: %s", activity.id, exc)
    if regenerated > 0:
        await db.commit()
    return {"regenerated": regenerated}


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
