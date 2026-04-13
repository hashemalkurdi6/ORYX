# ORYX
from datetime import date, timedelta

import httpx

from app.config import settings

WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v1"


def get_auth_url(state: str) -> str:
    """Build the WHOOP OAuth authorization URL."""
    params = (
        f"client_id={settings.WHOOP_CLIENT_ID}"
        f"&redirect_uri={settings.WHOOP_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=read:recovery read:sleep read:workout offline"
        f"&state={state}"
    )
    return f"{WHOOP_AUTH_URL}?{params}"


async def exchange_code(code: str) -> dict:
    """Exchange an authorization code for WHOOP access + refresh tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            WHOOP_TOKEN_URL,
            data={
                "client_id": settings.WHOOP_CLIENT_ID,
                "client_secret": settings.WHOOP_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.WHOOP_REDIRECT_URI,
            },
        )
        response.raise_for_status()
        data = response.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
            "user_id": data.get("user", {}).get("id") or data.get("user_id"),
        }


async def refresh_token(refresh_token_str: str) -> dict:
    """Refresh an expired WHOOP access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            WHOOP_TOKEN_URL,
            data={
                "client_id": settings.WHOOP_CLIENT_ID,
                "client_secret": settings.WHOOP_CLIENT_SECRET,
                "refresh_token": refresh_token_str,
                "grant_type": "refresh_token",
            },
        )
        response.raise_for_status()
        data = response.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", refresh_token_str),
            "expires_in": data.get("expires_in"),
        }


async def fetch_recovery(access_token: str, days: int = 7) -> list[dict]:
    """Fetch recent recovery records from WHOOP API."""
    start_date = (date.today() - timedelta(days=days)).isoformat()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{WHOOP_API_BASE}/recovery",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"limit": days, "start": start_date},
        )
        response.raise_for_status()
        data = response.json()
        records = data.get("records", data) if isinstance(data, dict) else data
        return records


def parse_recovery_record(record: dict) -> dict:
    """
    Parse a single WHOOP recovery record into a normalized dict.
    Extracts recovery_score, hrv_rmssd_milli, resting_heart_rate,
    sleep_performance_percentage, day_strain, and date.
    """
    score = record.get("score", {}) or {}
    # WHOOP API returns created_at as the day timestamp
    created_at_str = record.get("created_at", "")
    record_date = created_at_str[:10] if created_at_str else None

    return {
        "date": record_date,
        "recovery_score": score.get("recovery_score"),
        "hrv_rmssd": score.get("hrv_rmssd_milli"),
        "resting_heart_rate": score.get("resting_heart_rate"),
        "sleep_performance_pct": score.get("sleep_performance_percentage"),
        "strain_score": record.get("day_strain"),
    }
