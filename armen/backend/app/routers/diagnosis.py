# ORYX
from datetime import date, timedelta, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.activity import Activity
from app.models.health_data import HealthSnapshot
from app.models.oura_data import OuraData
from app.models.whoop_data import WhoopData
from app.models.wellness import WellnessCheckin
from app.models.nutrition import NutritionLog
from app.models.user import User
from app.routers.auth import get_current_user
from app.services import claude_service

router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


def _require_anthropic_key() -> None:
    """Legacy name — daily diagnosis actually uses OpenAI. Gate on that key so
    we don't 503 just because an unused Anthropic key is absent."""
    from app.config import settings
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI diagnosis is not configured. Set OPENAI_API_KEY in .env",
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


def _whoop_to_dict(w: WhoopData) -> dict:
    return {
        "date": w.date,
        "recovery_score": w.recovery_score,
        "hrv_rmssd": w.hrv_rmssd,
        "resting_heart_rate": w.resting_heart_rate,
        "sleep_performance_pct": w.sleep_performance_pct,
        "strain_score": w.strain_score,
    }


def _oura_to_dict(o: OuraData) -> dict:
    return {
        "date": o.date,
        "readiness_score": o.readiness_score,
        "sleep_score": o.sleep_score,
        "hrv_average": o.hrv_average,
        "rem_sleep_minutes": o.rem_sleep_minutes,
        "deep_sleep_minutes": o.deep_sleep_minutes,
        "light_sleep_minutes": o.light_sleep_minutes,
        "sleep_efficiency": o.sleep_efficiency,
    }


def _wellness_to_dict(w: WellnessCheckin) -> dict:
    return {
        "date": w.date,
        "mood": w.mood,
        "energy": w.energy,
        "soreness": w.soreness,
        "notes": w.notes,
    }


def _nutrition_to_dict(n: NutritionLog) -> dict:
    return {
        "meal_name": n.meal_name,
        "calories": n.calories,
        "protein_g": n.protein_g,
        "carbs_g": n.carbs_g,
        "fat_g": n.fat_g,
        "notes": n.notes,
        "logged_at": n.logged_at,
    }


@router.get("/daily", deprecated=True)
async def daily_diagnosis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deprecated. Use POST /home/diagnosis — this endpoint 410s in the next release."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="GET /diagnosis/daily is retired. Use POST /home/diagnosis.",
    )


@router.post("/autopsy/{activity_id}")
async def workout_autopsy(
    activity_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and save a workout autopsy for a specific activity.
    Fetches Apple Health, WHOOP, Oura, and wellness data for the day before.
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

    activity_date = activity.start_date.date()
    day_before = activity_date - timedelta(days=1)

    # Apple Health snapshot for day_before
    snap_result = await db.execute(
        select(HealthSnapshot).where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date == day_before,
        )
    )
    pre_health = snap_result.scalar_one_or_none()

    # WHOOP data for day_before
    whoop_result = await db.execute(
        select(WhoopData).where(
            WhoopData.user_id == current_user.id,
            WhoopData.date == day_before,
        )
    )
    pre_whoop = whoop_result.scalar_one_or_none()

    # Oura data for day_before
    oura_result = await db.execute(
        select(OuraData).where(
            OuraData.user_id == current_user.id,
            OuraData.date == day_before,
        )
    )
    pre_oura = oura_result.scalar_one_or_none()

    # Wellness check-in for day_before
    wellness_result = await db.execute(
        select(WellnessCheckin).where(
            WellnessCheckin.user_id == current_user.id,
            WellnessCheckin.date == day_before,
        )
    )
    pre_wellness = wellness_result.scalar_one_or_none()

    activity_dict = _activity_to_dict(activity)
    pre_health_dict = _snapshot_to_dict(pre_health) if pre_health else None
    pre_whoop_dict = _whoop_to_dict(pre_whoop) if pre_whoop else None
    pre_oura_dict = _oura_to_dict(pre_oura) if pre_oura else None
    pre_wellness_dict = _wellness_to_dict(pre_wellness) if pre_wellness else None

    try:
        autopsy_text = await claude_service.generate_workout_autopsy(
            activity=activity_dict,
            pre_activity_health=pre_health_dict,
            pre_activity_whoop=pre_whoop_dict,
            pre_activity_oura=pre_oura_dict,
            pre_activity_wellness=pre_wellness_dict,
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
