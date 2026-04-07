from datetime import date, timedelta, datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.health_data import HealthSnapshot
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.health_data import HealthSnapshotBulkIn, HealthSnapshotOut

router = APIRouter(prefix="/health", tags=["health"])


@router.post("/snapshots", status_code=status.HTTP_200_OK)
async def bulk_upsert_snapshots(
    payload: HealthSnapshotBulkIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk upsert HealthSnapshots from mobile HealthKit data.
    Uses INSERT ... ON CONFLICT DO UPDATE to upsert by (user_id, date).
    """
    if not payload.snapshots:
        return {"upserted": 0}

    import uuid

    rows = []
    for snap in payload.snapshots:
        rows.append({
            "id": uuid.uuid4(),
            "user_id": current_user.id,
            "date": snap.date,
            "sleep_duration_hours": snap.sleep_duration_hours,
            "sleep_quality_score": snap.sleep_quality_score,
            "hrv_ms": snap.hrv_ms,
            "resting_heart_rate": snap.resting_heart_rate,
            "steps": snap.steps,
            "active_energy_kcal": snap.active_energy_kcal,
            "created_at": datetime.utcnow(),
        })

    stmt = pg_insert(HealthSnapshot).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_health_snapshot_user_date",
        set_={
            "sleep_duration_hours": stmt.excluded.sleep_duration_hours,
            "sleep_quality_score": stmt.excluded.sleep_quality_score,
            "hrv_ms": stmt.excluded.hrv_ms,
            "resting_heart_rate": stmt.excluded.resting_heart_rate,
            "steps": stmt.excluded.steps,
            "active_energy_kcal": stmt.excluded.active_energy_kcal,
        },
    )
    await db.execute(stmt)
    await db.flush()

    return {"upserted": len(rows)}


@router.get("/snapshots", response_model=list[HealthSnapshotOut])
async def get_snapshots(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N days of health snapshots for the current user."""
    cutoff = date.today() - timedelta(days=days)

    result = await db.execute(
        select(HealthSnapshot)
        .where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date >= cutoff,
        )
        .order_by(HealthSnapshot.date.asc())
    )
    snapshots = result.scalars().all()
    return [HealthSnapshotOut.model_validate(s) for s in snapshots]
