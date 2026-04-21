"""Per-user timezone helpers.

`user.timezone` holds an IANA name (e.g. "America/Los_Angeles"). The mobile
client sends `X-User-Timezone` on requests, and `capture_user_timezone()`
persists it on the user on write. Day-boundary queries that care about the
user's local "today" should use `user_today(user)` instead of `date.today()`,
and `user_day_bounds(user)` instead of `datetime.utcnow()` → midnight.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Request


_UTC = ZoneInfo("UTC")


def _zone(user) -> ZoneInfo:
    name = (getattr(user, "timezone", None) or "UTC").strip()
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return _UTC


def user_today(user) -> date:
    """The user's local current date."""
    return datetime.now(_zone(user)).date()


def user_day_bounds(user, d: date | None = None) -> tuple[datetime, datetime]:
    """Return UTC-aware (start, end) datetimes that bracket the user's local day `d`.

    Use this in `WHERE logged_at >= start AND logged_at < end` clauses so the
    daily rollover happens at the user's midnight, not UTC midnight.
    """
    tz = _zone(user)
    day = d or datetime.now(tz).date()
    start_local = datetime(day.year, day.month, day.day, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(_UTC), end_local.astimezone(_UTC)


def capture_user_timezone(request: Request, user) -> None:
    """Extract `X-User-Timezone` from the request headers and persist on `user`.

    Call from login / dashboard / any frequently-hit authenticated endpoint so
    the stored timezone drifts in as users move between regions. No-ops on an
    unknown / malformed header.
    """
    tz_name = (request.headers.get("x-user-timezone") or "").strip()
    if not tz_name or len(tz_name) > 64:
        return
    try:
        ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return
    if getattr(user, "timezone", None) != tz_name:
        user.timezone = tz_name
