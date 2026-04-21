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


@router.get("/daily")
async def daily_diagnosis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run a daily diagnosis using the last 7 days of health data, WHOOP data,
    Oura data, today's wellness check-in, today's nutrition, and last 3 activities.
    """
    today = date.today()
    cutoff_7 = today - timedelta(days=7)

    # Apple Health snapshots
    snap_result = await db.execute(
        select(HealthSnapshot)
        .where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date >= cutoff_7,
        )
        .order_by(HealthSnapshot.date.asc())
    )
    snapshots = snap_result.scalars().all()

    # Last 3 activities
    act_result = await db.execute(
        select(Activity)
        .where(Activity.user_id == current_user.id)
        .order_by(Activity.start_date.desc())
        .limit(3)
    )
    activities = act_result.scalars().all()

    # WHOOP data — last 7 days
    whoop_result = await db.execute(
        select(WhoopData)
        .where(
            WhoopData.user_id == current_user.id,
            WhoopData.date >= cutoff_7,
        )
        .order_by(WhoopData.date.asc())
    )
    whoop_rows = whoop_result.scalars().all()

    # Oura data — last 7 days
    oura_result = await db.execute(
        select(OuraData)
        .where(
            OuraData.user_id == current_user.id,
            OuraData.date >= cutoff_7,
        )
        .order_by(OuraData.date.asc())
    )
    oura_rows = oura_result.scalars().all()

    # Today's wellness check-in
    wellness_result = await db.execute(
        select(WellnessCheckin).where(
            WellnessCheckin.user_id == current_user.id,
            WellnessCheckin.date == today,
        )
    )
    wellness_row = wellness_result.scalar_one_or_none()

    # Today's nutrition logs (UTC)
    now = datetime.utcnow()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta as td
    end_of_day = start_of_day + td(days=1)
    nutrition_result = await db.execute(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= start_of_day,
            NutritionLog.logged_at < end_of_day,
        )
        .order_by(NutritionLog.logged_at.asc())
    )
    nutrition_rows = nutrition_result.scalars().all()

    health_dicts = [_snapshot_to_dict(s) for s in snapshots]
    activity_dicts = [_activity_to_dict(a) for a in activities]
    whoop_dicts = [_whoop_to_dict(w) for w in whoop_rows] if whoop_rows else None
    oura_dicts = [_oura_to_dict(o) for o in oura_rows] if oura_rows else None
    wellness_dict = _wellness_to_dict(wellness_row) if wellness_row else None
    nutrition_dicts = [_nutrition_to_dict(n) for n in nutrition_rows] if nutrition_rows else None

    try:
        result = await claude_service.generate_daily_diagnosis(
            health_snapshots=health_dicts,
            recent_activities=activity_dicts,
            whoop_data=whoop_dicts,
            oura_data=oura_dicts,
            wellness_checkin=wellness_dict,
            nutrition_today=nutrition_dicts,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate diagnosis: {exc}",
        )

    return result


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
