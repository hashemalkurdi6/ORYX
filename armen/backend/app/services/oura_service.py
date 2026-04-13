# ORYX
import httpx

from app.config import settings

OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize"
OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token"
OURA_API_BASE = "https://api.ouraring.com/v2/usercollection"


def get_auth_url(state: str) -> str:
    """Build the Oura OAuth authorization URL."""
    params = (
        f"client_id={settings.OURA_CLIENT_ID}"
        f"&redirect_uri={settings.OURA_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=daily"
        f"&state={state}"
    )
    return f"{OURA_AUTH_URL}?{params}"


async def exchange_code(code: str) -> dict:
    """Exchange an authorization code for Oura access + refresh tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OURA_TOKEN_URL,
            data={
                "client_id": settings.OURA_CLIENT_ID,
                "client_secret": settings.OURA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.OURA_REDIRECT_URI,
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_token(refresh_token_str: str) -> dict:
    """Refresh an expired Oura access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OURA_TOKEN_URL,
            data={
                "client_id": settings.OURA_CLIENT_ID,
                "client_secret": settings.OURA_CLIENT_SECRET,
                "refresh_token": refresh_token_str,
                "grant_type": "refresh_token",
            },
        )
        response.raise_for_status()
        return response.json()


async def fetch_readiness(
    access_token: str, start_date: str, end_date: str
) -> list[dict]:
    """Fetch daily readiness data from Oura API for a date range."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OURA_API_BASE}/daily_readiness",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"start_date": start_date, "end_date": end_date},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("data", [])


async def fetch_sleep(
    access_token: str, start_date: str, end_date: str
) -> list[dict]:
    """Fetch daily sleep data from Oura API for a date range."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OURA_API_BASE}/daily_sleep",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"start_date": start_date, "end_date": end_date},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("data", [])


def parse_readiness_record(record: dict) -> dict:
    """Parse a single Oura readiness record into a normalized dict."""
    return {
        "date": record.get("day"),
        "readiness_score": record.get("score"),
    }


def parse_sleep_record(record: dict) -> dict:
    """
    Parse a single Oura daily_sleep record into a normalized dict.
    Extracts sleep score, HRV average, rem/deep/light minutes, and efficiency.
    """
    contributors = record.get("contributors", {}) or {}
    # Oura returns sleep durations in seconds — convert to minutes
    rem_seconds = record.get("rem_sleep_duration")
    deep_seconds = record.get("deep_sleep_duration")
    light_seconds = record.get("light_sleep_duration")

    rem_minutes = int(rem_seconds / 60) if rem_seconds is not None else None
    deep_minutes = int(deep_seconds / 60) if deep_seconds is not None else None
    light_minutes = int(light_seconds / 60) if light_seconds is not None else None

    # Efficiency is returned as a percentage (0-100) in the API
    efficiency = record.get("efficiency")

    # HRV average may be nested in contributors or at top level
    hrv_average = record.get("average_hrv") or contributors.get("hrv_average")

    return {
        "date": record.get("day"),
        "sleep_score": record.get("score"),
        "hrv_average": float(hrv_average) if hrv_average is not None else None,
        "rem_sleep_minutes": rem_minutes,
        "deep_sleep_minutes": deep_minutes,
        "light_sleep_minutes": light_minutes,
        "sleep_efficiency": float(efficiency) if efficiency is not None else None,
    }


def merge_daily_oura(
    readiness_records: list[dict], sleep_records: list[dict]
) -> list[dict]:
    """
    Merge readiness and sleep records by date into a single list of dicts
    suitable for upserting into OuraData.
    """
    by_date: dict[str, dict] = {}

    for rec in readiness_records:
        parsed = parse_readiness_record(rec)
        day = parsed["date"]
        if day:
            by_date.setdefault(day, {"date": day})
            by_date[day]["readiness_score"] = parsed["readiness_score"]

    for rec in sleep_records:
        parsed = parse_sleep_record(rec)
        day = parsed["date"]
        if day:
            by_date.setdefault(day, {"date": day})
            by_date[day].update({
                "sleep_score": parsed["sleep_score"],
                "hrv_average": parsed["hrv_average"],
                "rem_sleep_minutes": parsed["rem_sleep_minutes"],
                "deep_sleep_minutes": parsed["deep_sleep_minutes"],
                "light_sleep_minutes": parsed["light_sleep_minutes"],
                "sleep_efficiency": parsed["sleep_efficiency"],
            })

    return list(by_date.values())
