import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.activity import Activity
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.activity import ActivityOut, ActivityList
from app.services import strava_service

router = APIRouter(prefix="/strava", tags=["strava"])


def _require_strava_keys() -> None:
    from app.config import settings
    if not settings.STRAVA_CLIENT_ID or not settings.STRAVA_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Strava integration is not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env",
        )


async def _ensure_fresh_token(user: User, db: AsyncSession) -> str:
    """Return a valid access token, refreshing if expired."""
    now = datetime.utcnow()
    if user.strava_token_expires_at and user.strava_token_expires_at <= now:
        if not user.strava_refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Strava token expired and no refresh token available. Please re-connect Strava.",
            )
        token_data = await strava_service.refresh_token(user.strava_refresh_token)
        user.strava_access_token = token_data["access_token"]
        user.strava_refresh_token = token_data["refresh_token"]
        user.strava_token_expires_at = datetime.utcfromtimestamp(token_data["expires_at"])
        await db.flush()
    return user.strava_access_token


async def _upsert_activities(raw_activities: list[dict], user: User, db: AsyncSession) -> None:
    """Insert or update activities from Strava API data."""
    for raw in raw_activities:
        parsed = strava_service.parse_activity(raw, user.id)
        strava_id = parsed["strava_id"]

        result = await db.execute(
            select(Activity).where(Activity.strava_id == strava_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update mutable fields
            existing.name = parsed["name"]
            existing.sport_type = parsed["sport_type"]
            existing.start_date = parsed["start_date"]
            existing.distance_meters = parsed["distance_meters"]
            existing.elapsed_time_seconds = parsed["elapsed_time_seconds"]
            existing.moving_time_seconds = parsed["moving_time_seconds"]
            existing.avg_heart_rate = parsed["avg_heart_rate"]
            existing.max_heart_rate = parsed["max_heart_rate"]
            existing.avg_pace_seconds_per_km = parsed["avg_pace_seconds_per_km"]
            existing.total_elevation_gain = parsed["total_elevation_gain"]
            existing.raw_strava_data = parsed["raw_strava_data"]
        else:
            activity = Activity(**parsed)
            db.add(activity)

    await db.flush()


@router.get("/auth-url")
async def get_strava_auth_url(current_user: User = Depends(get_current_user), _: None = Depends(_require_strava_keys)):
    """Return the Strava OAuth authorization URL."""
    # Embed user ID in state so the callback can identify the user without a JWT
    state = f"{current_user.id}:{secrets.token_urlsafe(16)}"
    url = strava_service.get_auth_url(state=state)
    return {"url": url, "state": state}


@router.get("/callback")
async def strava_callback(
    code: str = Query(...),
    state: str = Query(default=""),
    _: None = Depends(_require_strava_keys),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Strava OAuth callback: exchange code for tokens, save to user,
    fetch and save recent 20 activities.
    """
    # Resolve user from state (format: "<user_id>:<random>")
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
        token_data = await strava_service.exchange_code(code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange Strava authorization code: {exc}",
        )

    current_user.strava_access_token = token_data["access_token"]
    current_user.strava_refresh_token = token_data["refresh_token"]
    current_user.strava_token_expires_at = datetime.utcfromtimestamp(
        token_data["expires_at"]
    )
    athlete = token_data.get("athlete", {})
    current_user.strava_athlete_id = athlete.get("id")
    await db.flush()

    # Fetch and save recent 20 activities
    try:
        raw_activities = await strava_service.fetch_activities(
            current_user.strava_access_token, per_page=20
        )
        await _upsert_activities(raw_activities, current_user, db)
    except Exception as exc:
        # Non-fatal — tokens are saved, activities can be synced later
        return {
            "status": "connected",
            "athlete_id": current_user.strava_athlete_id,
            "warning": f"Strava connected but activity sync failed: {exc}",
        }

    return {
        "status": "connected",
        "athlete_id": current_user.strava_athlete_id,
        "activities_synced": len(raw_activities),
    }


@router.post("/sync")
async def sync_strava(
    _: None = Depends(_require_strava_keys),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch and upsert latest 20 activities from Strava."""
    if not current_user.strava_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Strava account not connected. Please connect Strava first.",
        )

    access_token = await _ensure_fresh_token(current_user, db)

    try:
        raw_activities = await strava_service.fetch_activities(access_token, per_page=20)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch activities from Strava: {exc}",
        )

    await _upsert_activities(raw_activities, current_user, db)

    return {"status": "synced", "activities_synced": len(raw_activities)}


@router.get("/activities", response_model=ActivityList)
async def get_activities(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of user activities."""
    offset = (page - 1) * per_page

    result = await db.execute(
        select(Activity)
        .where(Activity.user_id == current_user.id)
        .order_by(Activity.start_date.desc())
        .offset(offset)
        .limit(per_page)
    )
    activities = result.scalars().all()

    # Get total count
    from sqlalchemy import func
    count_result = await db.execute(
        select(func.count()).select_from(Activity).where(Activity.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    activity_outs = []
    for act in activities:
        act_dict = {
            "id": act.id,
            "user_id": act.user_id,
            "strava_id": act.strava_id,
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
            "autopsy_text": act.autopsy_text,
            "autopsy_generated_at": act.autopsy_generated_at,
            "summary_polyline": ((act.raw_strava_data or {}).get("map") or {}).get("summary_polyline"),
            "created_at": act.created_at,
            "pace_per_km_str": "N/A",
        }
        activity_outs.append(ActivityOut.model_validate(act_dict))

    return ActivityList(activities=activity_outs, total=total)
