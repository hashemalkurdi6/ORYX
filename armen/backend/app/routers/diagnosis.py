from datetime import date, timedelta, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.activity import Activity
from app.models.health_data import HealthSnapshot
from app.models.user import User
from app.routers.auth import get_current_user
from app.services import claude_service

router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


def _require_anthropic_key() -> None:
    from app.config import settings
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI diagnosis is not configured. Set ANTHROPIC_API_KEY in .env",
        )


def _snapshot_to_dict(snap: HealthSnapshot) -> dict:
    return {
        "date": snap.date,
        "sleep_duration_hours": snap.sleep_duration_hours,
        "sleep_quality_score": snap.sleep_quality_score,
        "hrv_ms": snap.hrv_ms,
        "resting_heart_rate": snap.resting_heart_rate,
        "steps": snap.steps,
        "active_energy_kcal": snap.active_energy_kcal,
    }


def _activity_to_dict(act: Activity) -> dict:
    return {
        "name": act.name,
        "sport_type": act.sport_type,
        "start_date": act.start_date,
        "distance_meters": act.distance_meters,
        "elapsed_time_seconds": act.elapsed_time_seconds,
        "moving_time_seconds": act.moving_time_seconds,
        "avg_heart_rate": act.avg_heart_rate,
        "max_heart_rate": act.max_heart_rate,
        "avg_pace_seconds_per_km": act.avg_pace_seconds_per_km,
        "total_elevation_gain": act.total_elevation_gain,
    }


@router.get("/daily")
async def daily_diagnosis(
    _: None = Depends(_require_anthropic_key),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run a daily diagnosis using the last 7 days of health data
    and the last 3 activities.
    """
    # Fetch last 7 days of health snapshots
    cutoff = date.today() - timedelta(days=7)
    snap_result = await db.execute(
        select(HealthSnapshot)
        .where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date >= cutoff,
        )
        .order_by(HealthSnapshot.date.asc())
    )
    snapshots = snap_result.scalars().all()

    # Fetch last 3 activities
    act_result = await db.execute(
        select(Activity)
        .where(Activity.user_id == current_user.id)
        .order_by(Activity.start_date.desc())
        .limit(3)
    )
    activities = act_result.scalars().all()

    health_dicts = [_snapshot_to_dict(s) for s in snapshots]
    activity_dicts = [_activity_to_dict(a) for a in activities]

    try:
        result = await claude_service.generate_daily_diagnosis(health_dicts, activity_dicts)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate diagnosis: {exc}",
        )

    return result


@router.post("/autopsy/{activity_id}")
async def workout_autopsy(
    activity_id: UUID = Path(...),
    _: None = Depends(_require_anthropic_key),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and save a workout autopsy for a specific activity.
    Fetches the health snapshot for the day before the activity.
    """
    # Fetch the activity (must belong to current user)
    act_result = await db.execute(
        select(Activity).where(
            Activity.id == activity_id,
            Activity.user_id == current_user.id,
        )
    )
    activity = act_result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    # Fetch health snapshot for day before activity
    activity_date = activity.start_date.date()
    day_before = activity_date - timedelta(days=1)

    snap_result = await db.execute(
        select(HealthSnapshot).where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date == day_before,
        )
    )
    pre_health = snap_result.scalar_one_or_none()
    pre_health_dict = _snapshot_to_dict(pre_health) if pre_health else None

    activity_dict = _activity_to_dict(activity)

    try:
        autopsy_text = await claude_service.generate_workout_autopsy(
            activity_dict, pre_health_dict
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate workout autopsy: {exc}",
        )

    # Save autopsy to the activity record
    activity.autopsy_text = autopsy_text
    activity.autopsy_generated_at = datetime.utcnow()
    await db.flush()

    return {"autopsy": autopsy_text}
