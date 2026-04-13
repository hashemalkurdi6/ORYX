# ORYX
import uuid
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
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
):
    """Analyze a food photo using Claude vision and return estimated nutrition data."""
    result = await scan_food_image(payload.image, payload.media_type)
    return result


@router.post("/log", response_model=NutritionLogOut, status_code=status.HTTP_201_CREATED)
async def log_nutrition(
    payload: NutritionLogIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Insert a new nutrition log entry for the current user."""
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
        meal_type=payload.meal_type,
        source=payload.source,
        notes=payload.notes,
        created_at=now,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return NutritionLogOut.model_validate(entry)


@router.get("/today", response_model=list[NutritionLogOut])
async def get_nutrition_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all nutrition log entries for today (UTC) for the current user."""
    now = datetime.utcnow()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

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
    return [NutritionLogOut.model_validate(e) for e in entries]


@router.get("/logs", response_model=list[NutritionLogOut])
async def get_nutrition_logs(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return nutrition log entries for the last N days for the current user."""
    cutoff = datetime.utcnow() - timedelta(days=days)

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
    await db.delete(entry)
    await db.flush()
