# ORYX
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
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
    row = {
        "id": uuid.uuid4(),
        "user_id": current_user.id,
        "date": payload.date,
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
            "mood": stmt.excluded.mood,
            "energy": stmt.excluded.energy,
            "soreness": stmt.excluded.soreness,
            "notes": stmt.excluded.notes,
        },
    )
    await db.execute(stmt)
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
