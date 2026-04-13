# ORYX
import secrets
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.whoop_data import WhoopData
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.whoop import WhoopDataOut
from app.services import whoop_service

router = APIRouter(prefix="/whoop", tags=["whoop"])


def _require_whoop_keys() -> None:
    from app.config import settings
    if not settings.WHOOP_CLIENT_ID or not settings.WHOOP_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WHOOP integration is not configured. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env",
        )


async def _ensure_fresh_whoop_token(user: User, db: AsyncSession) -> str:
    """Return a valid WHOOP access token, refreshing if expired."""
    now = datetime.utcnow()
    if user.whoop_token_expires_at and user.whoop_token_expires_at <= now:
        if not user.whoop_refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="WHOOP token expired and no refresh token available. Please re-connect WHOOP.",
            )
        token_data = await whoop_service.refresh_token(user.whoop_refresh_token)
        user.whoop_access_token = token_data["access_token"]
        user.whoop_refresh_token = token_data.get("refresh_token", user.whoop_refresh_token)
        expires_in = token_data.get("expires_in")
        if expires_in:
            user.whoop_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        await db.flush()
    return user.whoop_access_token


async def _upsert_whoop_data(parsed_records: list[dict], user: User, db: AsyncSession) -> int:
    """Upsert WhoopData rows from parsed recovery records. Returns count of rows upserted."""
    rows = []
    for rec in parsed_records:
        day_str = rec.get("date")
        if not day_str:
            continue
        try:
            day = date.fromisoformat(day_str)
        except (ValueError, TypeError):
            continue
        rows.append({
            "id": uuid.uuid4(),
            "user_id": user.id,
            "date": day,
            "recovery_score": rec.get("recovery_score"),
            "hrv_rmssd": rec.get("hrv_rmssd"),
            "resting_heart_rate": rec.get("resting_heart_rate"),
            "sleep_performance_pct": rec.get("sleep_performance_pct"),
            "strain_score": rec.get("strain_score"),
            "created_at": datetime.utcnow(),
        })

    if not rows:
        return 0

    stmt = pg_insert(WhoopData).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_whoop_data_user_date",
        set_={
            "recovery_score": stmt.excluded.recovery_score,
            "hrv_rmssd": stmt.excluded.hrv_rmssd,
            "resting_heart_rate": stmt.excluded.resting_heart_rate,
            "sleep_performance_pct": stmt.excluded.sleep_performance_pct,
            "strain_score": stmt.excluded.strain_score,
        },
    )
    await db.execute(stmt)
    await db.flush()
    return len(rows)


@router.get("/auth-url")
async def get_whoop_auth_url(
    current_user: User = Depends(get_current_user),
    _: None = Depends(_require_whoop_keys),
):
    """Return the WHOOP OAuth authorization URL."""
    state = secrets.token_urlsafe(16)
    url = whoop_service.get_auth_url(state=state)
    return {"url": url, "state": state}


@router.get("/callback")
async def whoop_callback(
    code: str = Query(...),
    state: str = Query(default=""),
    _: None = Depends(_require_whoop_keys),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle WHOOP OAuth callback: exchange code for tokens, save to user,
    fetch 7 days of recovery data, upsert WhoopData rows.
    """
    try:
        token_data = await whoop_service.exchange_code(code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange WHOOP authorization code: {exc}",
        )

    current_user.whoop_access_token = token_data["access_token"]
    current_user.whoop_refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")
    if expires_in:
        current_user.whoop_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    whoop_uid = token_data.get("user_id")
    if whoop_uid:
        current_user.whoop_user_id = str(whoop_uid)
    await db.flush()

    try:
        raw_records = await whoop_service.fetch_recovery(
            current_user.whoop_access_token, days=7
        )
        parsed = [whoop_service.parse_recovery_record(r) for r in raw_records]
        days_synced = await _upsert_whoop_data(parsed, current_user, db)
    except Exception as exc:
        return {
            "status": "connected",
            "warning": f"WHOOP connected but data sync failed: {exc}",
            "days_synced": 0,
        }

    return {"status": "connected", "days_synced": days_synced}


@router.post("/sync")
async def sync_whoop(
    _: None = Depends(_require_whoop_keys),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch 7 days of WHOOP recovery data and upsert."""
    if not current_user.whoop_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WHOOP account not connected. Please connect WHOOP first.",
        )

    access_token = await _ensure_fresh_whoop_token(current_user, db)

    try:
        raw_records = await whoop_service.fetch_recovery(access_token, days=7)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch recovery data from WHOOP: {exc}",
        )

    parsed = [whoop_service.parse_recovery_record(r) for r in raw_records]
    synced = await _upsert_whoop_data(parsed, current_user, db)

    return {"synced": synced}


@router.get("/data", response_model=list[WhoopDataOut])
async def get_whoop_data(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N days of WHOOP data for the current user."""
    cutoff = date.today() - timedelta(days=days)

    result = await db.execute(
        select(WhoopData)
        .where(
            WhoopData.user_id == current_user.id,
            WhoopData.date >= cutoff,
        )
        .order_by(WhoopData.date.asc())
    )
    records = result.scalars().all()
    return [WhoopDataOut.model_validate(r) for r in records]
