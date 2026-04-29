# ORYX
import logging
import uuid
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

logger = logging.getLogger(__name__)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.nutrition import NutritionLog
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.nutrition import FoodScanRequest, FoodScanResult, NutritionLogIn, NutritionLogOut
from app.services.claude_service import scan_food_image

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.post("/scan", response_model=FoodScanResult)
async def scan_food(
    payload: FoodScanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze a food photo using Claude vision and return estimated nutrition data."""
    from app.services.rate_limit import check_rate_limit
    await check_rate_limit(db, f"food-scan:{current_user.id}", limit=30, window_seconds=86400)

    logger.info(
        "POST /nutrition/scan user=%s image_len=%d media_type=%s",
        current_user.id,
        len(payload.image),
        payload.media_type,
    )
    try:
        result = await scan_food_image(payload.image, payload.media_type)
        logger.info("POST /nutrition/scan result: food_name=%r calories=%s", result.get("food_name"), result.get("calories"))
        return result
    except Exception as exc:
        logger.exception("POST /nutrition/scan failed: %s", exc)
        raise


@router.post("/log", response_model=NutritionLogOut, status_code=status.HTTP_201_CREATED)
async def log_nutrition(
    payload: NutritionLogIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Insert a new nutrition log entry for the current user."""
    from app.services.readiness_service import invalidate_readiness_cache
    now = datetime.utcnow()
    entry = NutritionLog(
        id=uuid.uuid4(),
        user_id=current_user.id,
        logged_at=now,
        meal_name=payload.meal_name,
        description=payload.description,
        calories=payload.calories,
        protein_g=payload.protein_g,
        carbs_g=payload.carbs_g,
        fat_g=payload.fat_g,
        fibre_g=payload.fibre_g,
        sugar_g=payload.sugar_g,
        sodium_mg=payload.sodium_mg,
        vitamin_d_iu=payload.vitamin_d_iu,
        magnesium_mg=payload.magnesium_mg,
        iron_mg=payload.iron_mg,
        calcium_mg=payload.calcium_mg,
        zinc_mg=payload.zinc_mg,
        omega3_g=payload.omega3_g,
        meal_type=payload.meal_type,
        source=payload.source,
        notes=payload.notes,
        created_at=now,
    )
    db.add(entry)
    await invalidate_readiness_cache(current_user.id, db)
    await db.flush()
    from app.services.nutrition_service import update_daily_summary
    await update_daily_summary(current_user.id, now.date(), db)
    await db.refresh(entry)
    return NutritionLogOut.model_validate(entry)


@router.get("/today")
async def get_nutrition_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's logs, daily summary, and nutrition targets."""
    from app.models.daily_nutrition_summary import DailyNutritionSummary
    from app.services.nutrition_service import get_cached_targets
    from app.services.user_time import user_day_bounds, user_today

    start_of_day, end_of_day = user_day_bounds(current_user)
    today = user_today(current_user)

    result = await db.execute(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= start_of_day,
            NutritionLog.logged_at < end_of_day,
        )
        .order_by(NutritionLog.logged_at.asc())
    )
    entries = result.scalars().all()
    logs = [NutritionLogOut.model_validate(e) for e in entries]

    # Daily summary
    summary_res = await db.execute(
        select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date == today,
        )
    )
    summary_row = summary_res.scalar_one_or_none()
    summary = {
        "calories_consumed": summary_row.calories_consumed if summary_row else 0.0,
        "protein_consumed_g": summary_row.protein_consumed_g if summary_row else 0.0,
        "carbs_consumed_g": summary_row.carbs_consumed_g if summary_row else 0.0,
        "fat_consumed_g": summary_row.fat_consumed_g if summary_row else 0.0,
        "fibre_consumed_g": summary_row.fibre_consumed_g if summary_row else 0.0,
        "sugar_consumed_g": summary_row.sugar_consumed_g if summary_row else 0.0,
        "sodium_consumed_mg": summary_row.sodium_consumed_mg if summary_row else 0.0,
        "vitamin_d_consumed_iu": summary_row.vitamin_d_consumed_iu if summary_row else 0.0,
        "magnesium_consumed_mg": summary_row.magnesium_consumed_mg if summary_row else 0.0,
        "iron_consumed_mg": summary_row.iron_consumed_mg if summary_row else 0.0,
        "calcium_consumed_mg": summary_row.calcium_consumed_mg if summary_row else 0.0,
        "zinc_consumed_mg": summary_row.zinc_consumed_mg if summary_row else 0.0,
        "omega3_consumed_g": summary_row.omega3_consumed_g if summary_row else 0.0,
    }

    # Targets
    targets = await get_cached_targets(current_user.id, db)

    return {
        "logs": [log.model_dump() for log in logs],
        "summary": summary,
        "targets": targets,
    }


@router.get("/logs", response_model=list[NutritionLogOut])
async def get_nutrition_logs(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return nutrition log entries for the last N days for the current user."""
    from app.services.user_time import user_day_bounds, user_today
    start_today, _ = user_day_bounds(current_user, user_today(current_user))
    cutoff = start_today - timedelta(days=days - 1)

    result = await db.execute(
        select(NutritionLog)
        .where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= cutoff,
        )
        .order_by(NutritionLog.logged_at.asc())
    )
    entries = result.scalars().all()
    return [NutritionLogOut.model_validate(e) for e in entries]


@router.delete("/log/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nutrition_log(
    log_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a nutrition log entry if it belongs to the current user."""
    result = await db.execute(
        select(NutritionLog).where(
            NutritionLog.id == log_id,
            NutritionLog.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition log entry not found",
        )
    log_date = entry.logged_at.date()
    await db.delete(entry)
    await db.flush()
    from app.services.nutrition_service import update_daily_summary
    await update_daily_summary(current_user.id, log_date, db)


@router.get("/targets")
async def get_nutrition_targets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current nutrition targets for the user. Calculates if not yet stored."""
    from app.services.nutrition_service import calculate_macro_targets, get_cached_targets
    targets = await get_cached_targets(current_user.id, db)
    if targets is None:
        targets = await calculate_macro_targets(current_user.id, db)
    return targets


@router.get("/limits")
async def get_nutrition_limits(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return remaining daily allowances for rate-limited nutrition actions.

    Used by mobile clients to surface "X messages left today" counters and
    pre-empt 429s for food scan, meal-plan regen, and Ask ORYX assistant.
    """
    from app.models.rate_limit_event import RateLimitEvent
    from sqlalchemy import func as _func

    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=86400)

    async def _used(prefix: str) -> int:
        res = await db.execute(
            select(_func.count(RateLimitEvent.id)).where(
                RateLimitEvent.key == f"{prefix}:{current_user.id}",
                RateLimitEvent.created_at >= cutoff,
            )
        )
        return int(res.scalar() or 0)

    scan_used = await _used("food-scan")
    regen_used = await _used("meal-plan-regen")
    assistant_used = await _used("nutrition-assistant")

    def _bucket(used: int, limit: int) -> dict:
        return {
            "limit": limit,
            "used": min(used, limit),
            "remaining": max(0, limit - used),
        }

    return {
        "food_scan": _bucket(scan_used, 30),
        "meal_plan_regen": _bucket(regen_used, 3),
        "assistant": _bucket(assistant_used, 20),
    }


@router.post("/targets/recalculate")
async def recalculate_nutrition_targets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recalculate and save nutrition targets from current user profile and body stats."""
    from app.services.nutrition_service import calculate_macro_targets
    return await calculate_macro_targets(current_user.id, db)


# ── Water tracking ─────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BM


async def _get_water_targets(user_id, current_user, db):
    """Return (effective_target_ml, recommended_ml, container_size_ml) for the user."""
    from app.models.nutrition_profile import NutritionProfile
    from app.models.nutrition_targets import NutritionTargets
    from app.services.nutrition_service import _compute_water_target

    # Recommended = calculated from profile
    profile_res = await db.execute(select(NutritionProfile).where(NutritionProfile.user_id == user_id))
    profile = profile_res.scalar_one_or_none()
    recommended_ml = _compute_water_target(current_user, profile)

    # Effective target = override if set, else stored calculation, else recommended
    effective_target = recommended_ml
    if profile and profile.water_target_override_ml:
        effective_target = profile.water_target_override_ml
    else:
        tgt_res = await db.execute(select(NutritionTargets).where(NutritionTargets.user_id == user_id))
        tgt = tgt_res.scalar_one_or_none()
        if tgt and tgt.water_target_ml:
            effective_target = tgt.water_target_ml

    container_size_ml = 250
    if profile and profile.container_size_ml:
        container_size_ml = profile.container_size_ml

    return effective_target, recommended_ml, container_size_ml


@router.get("/water/today")
async def get_water_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's water intake and personalized target."""
    from app.models.daily_water_intake import DailyWaterIntake
    from app.services.user_time import user_today

    today = user_today(current_user)
    result = await db.execute(
        select(DailyWaterIntake).where(
            DailyWaterIntake.user_id == current_user.id,
            DailyWaterIntake.date == today,
        )
    )
    row = result.scalar_one_or_none()
    amount_ml = row.amount_ml if row else 0

    # Always use profile preference for container size — don't let daily row override it
    target_ml, recommended_ml, container_size_ml = await _get_water_targets(
        current_user.id, current_user, db
    )

    pct = round(amount_ml / target_ml * 100, 1) if target_ml > 0 else 0.0
    return {
        "amount_ml": amount_ml,
        "target_ml": target_ml,
        "container_size_ml": container_size_ml,
        "percentage": pct,
        "recommended_ml": recommended_ml,
    }


class WaterPatchIn(_BM):
    amount_ml: int
    container_size_ml: int = 250


@router.patch("/water/today")
async def patch_water_today(
    payload: WaterPatchIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upsert today's water intake (amount_ml)."""
    from app.models.daily_water_intake import DailyWaterIntake
    from app.services.user_time import user_today
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    today = user_today(current_user)
    amount_ml = max(0, payload.amount_ml)
    container_size_ml = max(50, payload.container_size_ml)

    stmt = pg_insert(DailyWaterIntake).values(
        user_id=current_user.id,
        date=today,
        glasses_count=0,
        amount_ml=amount_ml,
        container_size_ml=container_size_ml,
        updated_at=datetime.utcnow(),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "date"],
        set_={
            "amount_ml": amount_ml,
            "container_size_ml": container_size_ml,
            "updated_at": datetime.utcnow(),
        },
    )
    await db.execute(stmt)
    await db.flush()

    target_ml, recommended_ml, _ = await _get_water_targets(current_user.id, current_user, db)
    pct = round(amount_ml / target_ml * 100, 1) if target_ml > 0 else 0.0
    return {
        "amount_ml": amount_ml,
        "target_ml": target_ml,
        "container_size_ml": container_size_ml,
        "percentage": pct,
        "recommended_ml": recommended_ml,
    }


class WaterSettingsIn(_BM):
    target_ml: int | None = None   # None = reset to recommended
    container_size_ml: int | None = None
    water_input_mode: str | None = None  # 'glasses' | 'ml'


@router.patch("/water/settings")
async def patch_water_settings(
    payload: WaterSettingsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save user water preferences (target override, container size, input mode)."""
    from app.models.nutrition_profile import NutritionProfile
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    now = datetime.utcnow()
    update_vals: dict = {"updated_at": now}
    if payload.target_ml is not None:
        update_vals["water_target_override_ml"] = payload.target_ml
    elif "target_ml" in payload.model_fields_set:
        # Explicitly null → reset override
        update_vals["water_target_override_ml"] = None
    if payload.container_size_ml is not None:
        update_vals["container_size_ml"] = max(50, payload.container_size_ml)
    if payload.water_input_mode is not None:
        update_vals["water_input_mode"] = payload.water_input_mode

    # Upsert profile row (nutrition profile may or may not exist)
    profile_res = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()
    if profile:
        for k, v in update_vals.items():
            if hasattr(profile, k):
                setattr(profile, k, v)
        await db.flush()
    else:
        import uuid as _uuid
        stmt = pg_insert(NutritionProfile).values(
            id=_uuid.uuid4(),
            user_id=current_user.id,
            nutrition_survey_complete=False,
            created_at=now,
            **update_vals,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id"],
            set_={k: stmt.excluded[k] for k in update_vals},
        )
        await db.execute(stmt)
        await db.flush()

    target_ml, recommended_ml, container_size_ml = await _get_water_targets(
        current_user.id, current_user, db
    )
    return {
        "target_ml": target_ml,
        "recommended_ml": recommended_ml,
        "container_size_ml": container_size_ml,
    }


# ── Weekly nutrition summary ───────────────────────────────────────────────────

@router.get("/weekly-summary")
async def get_weekly_nutrition_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return weekly nutrition stats for the current and previous week."""
    from sqlalchemy import func

    now = datetime.utcnow()
    # Current week: Monday to today
    days_since_monday = now.weekday()  # 0=Mon
    week_start = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    # Last week: Mon to Sun
    last_week_start = week_start - timedelta(days=7)
    last_week_end = week_start

    async def _daily_stats(start: datetime, end: datetime):
        res = await db.execute(
            select(
                func.date(NutritionLog.logged_at).label("day"),
                func.sum(NutritionLog.calories).label("cal"),
                func.sum(NutritionLog.protein_g).label("prot"),
            ).where(
                NutritionLog.user_id == current_user.id,
                NutritionLog.logged_at >= start,
                NutritionLog.logged_at < end,
            ).group_by(func.date(NutritionLog.logged_at))
        )
        return res.all()

    this_week_rows = await _daily_stats(week_start, now + timedelta(days=1))
    last_week_rows = await _daily_stats(last_week_start, last_week_end)

    def _avg(rows, col_idx):
        vals = [r[col_idx] or 0 for r in rows if r[col_idx] is not None]
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    # Single source of truth — nutrition_targets, populated lazily.
    from app.services.nutrition_service import calculate_macro_targets, get_cached_targets
    targets = await get_cached_targets(current_user.id, db) or await calculate_macro_targets(current_user.id, db)
    calorie_target = targets.get("daily_calorie_target") or 2000
    protein_target = targets.get("protein_g") or 125.0

    def _days_on_target(rows):
        count = 0
        for r in rows:
            cal = r[1] or 0
            if cal > 0 and abs(cal - calorie_target) / calorie_target <= 0.10:
                count += 1
        return count

    def _days_protein_hit(rows):
        count = 0
        for r in rows:
            prot = r[2] or 0
            if prot > 0 and abs(prot - protein_target) / protein_target <= 0.10:
                count += 1
        return count

    return {
        "avg_daily_calories": _avg(this_week_rows, 1),
        "avg_daily_protein": _avg(this_week_rows, 2),
        "days_calorie_target_hit": _days_on_target(this_week_rows),
        "days_protein_target_hit": _days_protein_hit(this_week_rows),
        "last_week_avg_calories": _avg(last_week_rows, 1),
        "last_week_avg_protein": _avg(last_week_rows, 2),
    }


@router.get("/weekly-calories")
async def get_weekly_calories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return last 7 days of daily calorie totals vs target."""
    from sqlalchemy import func
    from app.services.nutrition_service import calculate_macro_targets, get_cached_targets

    targets = await get_cached_targets(current_user.id, db) or await calculate_macro_targets(current_user.id, db)
    calorie_target = targets.get("daily_calorie_target") or 2000

    now = datetime.utcnow()
    start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

    res = await db.execute(
        select(
            func.date(NutritionLog.logged_at).label("day"),
            func.sum(NutritionLog.calories).label("cal"),
        ).where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= start,
        ).group_by(func.date(NutritionLog.logged_at))
    )
    rows = {str(r[0]): (r[1] or 0) for r in res.all()}

    _DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    result = []
    for i in range(7):
        d = (start + timedelta(days=i)).date()
        result.append({
            "date": str(d),
            "calories_logged": round(rows.get(str(d), 0)),
            "target": calorie_target,
            "day_label": _DAY_LABELS[d.weekday()],
        })
    return result
