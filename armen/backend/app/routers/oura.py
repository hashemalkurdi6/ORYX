# ORYX
import secrets
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.oura_data import OuraData
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.oura import OuraDataOut
from app.services import oura_service

router = APIRouter(prefix="/oura", tags=["oura"])


def _require_oura_keys() -> None:
    from app.config import settings
    if not settings.OURA_CLIENT_ID or not settings.OURA_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Oura integration is not configured. Set OURA_CLIENT_ID and OURA_CLIENT_SECRET in .env",
        )


async def _ensure_fresh_oura_token(user: User, db: AsyncSession) -> str:
    """Return a valid Oura access token, refreshing if expired."""
    now = datetime.utcnow()
    if user.oura_token_expires_at and user.oura_token_expires_at <= now:
        if not user.oura_refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Oura token expired and no refresh token available. Please re-connect Oura.",
            )
        token_data = await oura_service.refresh_token(user.oura_refresh_token)
        user.oura_access_token = token_data["access_token"]
        user.oura_refresh_token = token_data.get("refresh_token", user.oura_refresh_token)
        expires_in = token_data.get("expires_in")
        if expires_in:
            user.oura_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        await db.flush()
    return user.oura_access_token


async def _upsert_oura_data(merged_records: list[dict], user: User, db: AsyncSession) -> int:
    """Upsert OuraData rows from merged readiness+sleep records. Returns count upserted."""
    rows = []
    for rec in merged_records:
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
            "readiness_score": rec.get("readiness_score"),
            "sleep_score": rec.get("sleep_score"),
            "hrv_average": rec.get("hrv_average"),
            "rem_sleep_minutes": rec.get("rem_sleep_minutes"),
            "deep_sleep_minutes": rec.get("deep_sleep_minutes"),
            "light_sleep_minutes": rec.get("light_sleep_minutes"),
            "sleep_efficiency": rec.get("sleep_efficiency"),
            "created_at": datetime.utcnow(),
        })

    if not rows:
        return 0

    stmt = pg_insert(OuraData).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_oura_data_user_date",
        set_={
            "readiness_score": stmt.excluded.readiness_score,
            "sleep_score": stmt.excluded.sleep_score,
            "hrv_average": stmt.excluded.hrv_average,
            "rem_sleep_minutes": stmt.excluded.rem_sleep_minutes,
            "deep_sleep_minutes": stmt.excluded.deep_sleep_minutes,
            "light_sleep_minutes": stmt.excluded.light_sleep_minutes,
            "sleep_efficiency": stmt.excluded.sleep_efficiency,
        },
    )
    await db.execute(stmt)
    await db.flush()
    return len(rows)


@router.get("/auth-url")
async def get_oura_auth_url(
    current_user: User = Depends(get_current_user),
    _: None = Depends(_require_oura_keys),
):
    """Return the Oura OAuth authorization URL."""
    # Embed user id in state so the browser-driven callback can identify the
    # user without an Authorization header (redirect drops it).
    state = f"{current_user.id}:{secrets.token_urlsafe(16)}"
    url = oura_service.get_auth_url(state=state)
    return {"url": url, "state": state}


@router.get("/callback")
async def oura_callback(
    code: str = Query(...),
    state: str = Query(default=""),
    _: None = Depends(_require_oura_keys),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Oura OAuth callback: exchange code for tokens, save to user,
    fetch last 7 days of readiness + sleep, merge by date, upsert OuraData rows.
    """
    user_id_str = state.split(":")[0] if ":" in state else None
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state parameter")
    import uuid as _uuid
    try:
        user_uuid = _uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user ID in state")
    user_result = await db.execute(select(User).where(User.id == user_uuid))
    current_user = user_result.scalar_one_or_none()
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    try:
        token_data = await oura_service.exchange_code(code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange Oura authorization code: {exc}",
        )

    current_user.oura_access_token = token_data["access_token"]
    current_user.oura_refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")
    if expires_in:
        current_user.oura_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    await db.flush()

    start_date = (date.today() - timedelta(days=7)).isoformat()
    end_date = date.today().isoformat()

    try:
        readiness_records = await oura_service.fetch_readiness(
            current_user.oura_access_token, start_date, end_date
        )
        sleep_records = await oura_service.fetch_sleep(
            current_user.oura_access_token, start_date, end_date
        )
        merged = oura_service.merge_daily_oura(readiness_records, sleep_records)
        days_synced = await _upsert_oura_data(merged, current_user, db)
    except Exception as exc:
        return {
            "status": "connected",
            "warning": f"Oura connected but data sync failed: {exc}",
            "days_synced": 0,
        }

    return {"status": "connected", "days_synced": days_synced}


@router.post("/sync")
async def sync_oura(
    _: None = Depends(_require_oura_keys),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch last 7 days of Oura readiness + sleep data and upsert."""
    if not current_user.oura_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Oura account not connected. Please connect Oura first.",
        )

    access_token = await _ensure_fresh_oura_token(current_user, db)

    start_date = (date.today() - timedelta(days=7)).isoformat()
    end_date = date.today().isoformat()

    try:
        readiness_records = await oura_service.fetch_readiness(access_token, start_date, end_date)
        sleep_records = await oura_service.fetch_sleep(access_token, start_date, end_date)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch data from Oura: {exc}",
        )

    merged = oura_service.merge_daily_oura(readiness_records, sleep_records)
    synced = await _upsert_oura_data(merged, current_user, db)

    return {"synced": synced}


@router.get("/data", response_model=list[OuraDataOut])
async def get_oura_data(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N days of Oura data for the current user."""
    cutoff = date.today() - timedelta(days=days)

    result = await db.execute(
        select(OuraData)
        .where(
            OuraData.user_id == current_user.id,
            OuraData.date >= cutoff,
        )
        .order_by(OuraData.date.asc())
    )
    records = result.scalars().all()
    return [OuraDataOut.model_validate(r) for r in records]
