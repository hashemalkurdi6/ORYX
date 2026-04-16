import uuid
from datetime import datetime

import httpx

from app.config import settings

STRAVA_AUTH_BASE = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"


def get_auth_url(state: str) -> str:
    """Build the Strava OAuth authorization URL."""
    params = (
        f"client_id={settings.STRAVA_CLIENT_ID}"
        f"&redirect_uri={settings.STRAVA_REDIRECT_URI}"
        f"&response_type=code"
        f"&approval_prompt=auto"
        f"&scope=activity:read_all"
        f"&state={state}"
    )
    return f"{STRAVA_AUTH_BASE}?{params}"


async def exchange_code(code: str) -> dict:
    """Exchange an authorization code for access + refresh tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.STRAVA_CLIENT_ID,
                "client_secret": settings.STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_token(refresh_token_str: str) -> dict:
    """Refresh an expired Strava access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.STRAVA_CLIENT_ID,
                "client_secret": settings.STRAVA_CLIENT_SECRET,
                "refresh_token": refresh_token_str,
                "grant_type": "refresh_token",
            },
        )
        response.raise_for_status()
        return response.json()


async def fetch_activities(access_token: str, per_page: int = 20) -> list[dict]:
    """Fetch the most recent activities from Strava."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"per_page": per_page, "page": 1},
        )
        response.raise_for_status()
        return response.json()


def parse_activity(raw: dict, user_id: uuid.UUID) -> dict:
    """
    Extract and normalize fields from raw Strava activity data into
    a dict suitable for creating/updating an Activity model instance.
    """
    distance_meters = raw.get("distance") or 0.0
    elapsed_time = raw.get("elapsed_time") or 0
    moving_time = raw.get("moving_time") or 0

    # Compute average pace (seconds per km) from elapsed time and distance
    avg_pace_seconds_per_km: float | None = None
    if distance_meters and distance_meters > 0:
        distance_km = distance_meters / 1000.0
        avg_pace_seconds_per_km = elapsed_time / distance_km

    # Parse start date — Strava returns ISO 8601 strings
    start_date_str = raw.get("start_date") or raw.get("start_date_local")
    if start_date_str:
        try:
            start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            start_date = datetime.utcnow()
    else:
        start_date = datetime.utcnow()

    # Average heart rate may be in average_heartrate key
    avg_hr = raw.get("average_heartrate") or raw.get("avg_heart_rate")
    max_hr = raw.get("max_heartrate") or raw.get("max_heart_rate")

    return {
        "user_id": user_id,
        "strava_id": raw["id"],
        "name": raw.get("name", "Unknown Activity"),
        "sport_type": raw.get("sport_type") or raw.get("type", "Unknown"),
        "start_date": start_date,
        "distance_meters": distance_meters if distance_meters > 0 else None,
        "elapsed_time_seconds": elapsed_time,
        "moving_time_seconds": moving_time,
        "avg_heart_rate": float(avg_hr) if avg_hr is not None else None,
        "max_heart_rate": float(max_hr) if max_hr is not None else None,
        "avg_pace_seconds_per_km": avg_pace_seconds_per_km,
        "total_elevation_gain": raw.get("total_elevation_gain"),
        "raw_strava_data": raw,
    }
