# ORYX
from datetime import date, timedelta

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.daily_steps import DailySteps
from app.routers.auth import get_current_user
from app.schemas.daily_steps import DailyStepsIn, DailyStepsOut

router = APIRouter(prefix="/steps", tags=["steps"])


@router.post("/", response_model=DailyStepsOut, status_code=status.HTTP_200_OK)
async def upsert_steps(
    payload: DailyStepsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upsert daily steps for the current user on a given date."""
    # Use raw SQL for INSERT ... ON CONFLICT ... DO UPDATE
    stmt = text(
        """
        INSERT INTO daily_steps (id, user_id, date, steps, created_at)
        VALUES (gen_random_uuid(), :user_id, :date, :steps, NOW())
        ON CONFLICT (user_id, date)
        DO UPDATE SET steps = EXCLUDED.steps
        RETURNING id, user_id, date, steps, created_at
        """
    )
    result = await db.execute(
        stmt,
        {"user_id": str(current_user.id), "date": payload.date, "steps": payload.steps},
    )
    await db.commit()
    row = result.mappings().one()

    # Fetch the ORM object for proper serialisation
    orm_result = await db.execute(
        select(DailySteps).where(
            DailySteps.user_id == current_user.id,
            DailySteps.date == payload.date,
        )
    )
    record = orm_result.scalar_one()
    return record


@router.get("/weekly", response_model=list[DailyStepsOut])
async def get_weekly_steps(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last 7 days of step counts for the current user."""
    today = date.today()
    seven_days_ago = today - timedelta(days=6)
    start_str = seven_days_ago.strftime("%Y-%m-%d")
    end_str = today.strftime("%Y-%m-%d")

    result = await db.execute(
        select(DailySteps)
        .where(
            DailySteps.user_id == current_user.id,
            DailySteps.date >= start_str,
            DailySteps.date <= end_str,
        )
        .order_by(DailySteps.date.asc())
    )
    return result.scalars().all()
