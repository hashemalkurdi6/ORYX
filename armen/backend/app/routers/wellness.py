# ORYX
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.health_data import HealthSnapshot
from app.models.wellness import WellnessCheckin
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.wellness import WellnessCheckinIn, WellnessCheckinOut

router = APIRouter(prefix="/wellness", tags=["wellness"])


@router.post("/checkin", response_model=WellnessCheckinOut)
async def upsert_wellness_checkin(
    payload: WellnessCheckinIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upsert today's wellness check-in (one per user per day)."""
    from app.services.readiness_service import invalidate_readiness_cache

    row = {
        "id": uuid.uuid4(),
        "user_id": current_user.id,
        "date": payload.date,
        "sleep_quality": payload.sleep_quality,
        "fatigue": payload.fatigue,
        "stress": payload.stress,
        "muscle_soreness": payload.muscle_soreness,
        "mood": payload.mood,
        "energy": payload.energy,
        "soreness": payload.soreness,
        "notes": payload.notes,
        "created_at": datetime.utcnow(),
    }

    stmt = pg_insert(WellnessCheckin).values([row])
    stmt = stmt.on_conflict_do_update(
        constraint="uq_wellness_checkin_user_date",
        set_={
            "sleep_quality": stmt.excluded.sleep_quality,
            "fatigue": stmt.excluded.fatigue,
            "stress": stmt.excluded.stress,
            "muscle_soreness": stmt.excluded.muscle_soreness,
            "mood": stmt.excluded.mood,
            "energy": stmt.excluded.energy,
            "soreness": stmt.excluded.soreness,
            "notes": stmt.excluded.notes,
        },
    )
    await db.execute(stmt)
    await invalidate_readiness_cache(current_user.id, db)
    await db.flush()

    # Fetch the upserted row to return it
    result = await db.execute(
        select(WellnessCheckin).where(
            WellnessCheckin.user_id == current_user.id,
            WellnessCheckin.date == payload.date,
        )
    )
    checkin = result.scalar_one()
    return WellnessCheckinOut.model_validate(checkin)


@router.get("/checkins", response_model=list[WellnessCheckinOut])
async def get_wellness_checkins(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N days of wellness check-ins for the current user."""
    cutoff = date.today() - timedelta(days=days)

    result = await db.execute(
        select(WellnessCheckin)
        .where(
            WellnessCheckin.user_id == current_user.id,
            WellnessCheckin.date >= cutoff,
        )
        .order_by(WellnessCheckin.date.asc())
    )
    checkins = result.scalars().all()
    return [WellnessCheckinOut.model_validate(c) for c in checkins]


@router.get("/trends")
async def get_wellness_trends(
    days: int = Query(default=30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated wellness trend data for the analytics dashboard."""
    import statistics

    cutoff = date.today() - timedelta(days=days)
    month_start = date.today().replace(day=1)

    # ── HRV data from health_snapshots ──────────────────────────────────────
    hrv_result = await db.execute(
        select(HealthSnapshot)
        .where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date >= cutoff,
            HealthSnapshot.hrv_ms.isnot(None),
        )
        .order_by(HealthSnapshot.date.asc())
    )
    hrv_rows = hrv_result.scalars().all()

    hrv_data = [{"date": str(r.date), "hrv_ms": r.hrv_ms} for r in hrv_rows]

    # HRV stats
    hrv_vals = [r.hrv_ms for r in hrv_rows if r.hrv_ms is not None]
    current_hrv = hrv_vals[-1] if hrv_vals else None
    seven_day_hrv = hrv_vals[-7:] if len(hrv_vals) >= 1 else []
    thirty_day_hrv = hrv_vals[-30:] if len(hrv_vals) >= 1 else []
    seven_day_avg_hrv = statistics.mean(seven_day_hrv) if seven_day_hrv else None
    thirty_day_avg_hrv = statistics.mean(thirty_day_hrv) if thirty_day_hrv else None

    hrv_trend = "stable"
    if current_hrv is not None and thirty_day_avg_hrv is not None:
        if current_hrv > thirty_day_avg_hrv * 1.05:
            hrv_trend = "up"
        elif current_hrv < thirty_day_avg_hrv * 0.95:
            hrv_trend = "down"

    # ── Sleep data from health_snapshots ────────────────────────────────────
    sleep_result = await db.execute(
        select(HealthSnapshot)
        .where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date >= cutoff,
            HealthSnapshot.sleep_duration_hours.isnot(None),
        )
        .order_by(HealthSnapshot.date.asc())
    )
    sleep_rows = sleep_result.scalars().all()

    sleep_data = [
        {"date": str(r.date), "duration_hours": r.sleep_duration_hours, "bedtime": None}
        for r in sleep_rows
    ]

    sleep_vals = [r.sleep_duration_hours for r in sleep_rows if r.sleep_duration_hours is not None]
    last_night_hours = sleep_vals[-1] if sleep_vals else None
    seven_day_sleep = sleep_vals[-7:] if sleep_vals else []
    seven_day_avg_sleep = statistics.mean(seven_day_sleep) if seven_day_sleep else None

    # Best sleep this month
    month_sleep_result = await db.execute(
        select(HealthSnapshot)
        .where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date >= month_start,
            HealthSnapshot.sleep_duration_hours.isnot(None),
        )
    )
    month_sleep_rows = month_sleep_result.scalars().all()
    month_sleep_vals = [r.sleep_duration_hours for r in month_sleep_rows if r.sleep_duration_hours is not None]
    best_this_month = max(month_sleep_vals) if month_sleep_vals else None

    # Bedtime variance — we don't store bedtime, so return None
    avg_bedtime_variance = None

    # ── Hooper / Wellness checkin data ──────────────────────────────────────
    hooper_result = await db.execute(
        select(WellnessCheckin)
        .where(
            WellnessCheckin.user_id == current_user.id,
            WellnessCheckin.date >= cutoff,
            WellnessCheckin.sleep_quality.isnot(None),
            WellnessCheckin.fatigue.isnot(None),
            WellnessCheckin.stress.isnot(None),
            WellnessCheckin.muscle_soreness.isnot(None),
        )
        .order_by(WellnessCheckin.date.asc())
    )
    hooper_rows = hooper_result.scalars().all()

    hooper_history = []
    for r in hooper_rows:
        total = (r.sleep_quality or 0) + (r.fatigue or 0) + (r.stress or 0) + (r.muscle_soreness or 0)
        hooper_history.append({
            "date": str(r.date),
            "sleep_quality": r.sleep_quality,
            "fatigue": r.fatigue,
            "stress": r.stress,
            "soreness": r.muscle_soreness,
            "total": total,
        })

    hooper_totals = [h["total"] for h in hooper_history]
    current_hooper_total = hooper_totals[-1] if hooper_totals else None
    seven_day_hooper = hooper_totals[-7:] if hooper_totals else []
    seven_day_avg_hooper = statistics.mean(seven_day_hooper) if seven_day_hooper else None

    # ── Readiness history derived from Hooper ───────────────────────────────
    # Normalize Hooper total (4=best, 28=worst) to a 0-100 score (100=best, 0=worst)
    readiness_history = []
    for h in hooper_history:
        total = h["total"]
        # Score: (28 - total) / 24 * 100, clamped 0-100
        score = max(0, min(100, round((28 - total) / 24 * 100)))
        readiness_history.append({"date": h["date"], "score": score})

    # Readiness stats this month
    month_readiness = [r for r in readiness_history if r["date"] >= str(month_start)]
    best_day = max(month_readiness, key=lambda x: x["score"]) if month_readiness else None
    worst_day = min(month_readiness, key=lambda x: x["score"]) if month_readiness else None
    monthly_avg = statistics.mean([r["score"] for r in month_readiness]) if month_readiness else None

    return {
        "hrv_data": hrv_data,
        "sleep_data": sleep_data,
        "readiness_history": readiness_history,
        "hooper_history": hooper_history,
        "hrv_stats": {
            "current_hrv": current_hrv,
            "seven_day_avg": seven_day_avg_hrv,
            "thirty_day_avg": thirty_day_avg_hrv,
            "trend_direction": hrv_trend,
        },
        "sleep_stats": {
            "last_night_hours": last_night_hours,
            "seven_day_avg": seven_day_avg_sleep,
            "best_this_month": best_this_month,
            "avg_bedtime_variance_minutes": avg_bedtime_variance,
        },
        "readiness_stats": {
            "best_day_this_month": best_day,
            "worst_day_this_month": worst_day,
            "monthly_average": monthly_avg,
        },
        "hooper_stats": {
            "current_total": current_hooper_total,
            "seven_day_avg": seven_day_avg_hooper,
        },
        "data_availability": {
            "has_hrv_data": len(hrv_data) > 0,
            "has_sleep_data": len(sleep_data) > 0,
            "has_readiness_history": len(readiness_history) > 0,
            "has_hooper_history": len(hooper_history) >= 5,
        },
    }
