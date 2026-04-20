"""DB-backed sliding-window rate limiter.

Counts events per key in a rolling window and raises 429 when exceeded.
Works across workers (backed by Postgres), unlike in-memory dicts.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit_event import RateLimitEvent


def client_ip(request: Request) -> str:
    """Best-effort client IP, preferring X-Forwarded-For if behind a proxy."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_rate_limit(
    db: AsyncSession,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Raise HTTP 429 if `key` has been hit >= `limit` times in the last `window_seconds`.

    Always records the current attempt (even when denied, so repeat offenders
    stay over the limit for the full window).
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)
    count_res = await db.execute(
        select(func.count(RateLimitEvent.id)).where(
            RateLimitEvent.key == key,
            RateLimitEvent.created_at >= cutoff,
        )
    )
    count = int(count_res.scalar() or 0)

    # Always record the attempt (denied or not).
    db.add(RateLimitEvent(key=key))
    await db.flush()

    # Opportunistic GC of rows older than 24 hours. ~1% of requests trigger this.
    if (hash(key) % 100) == 0:
        await db.execute(
            delete(RateLimitEvent).where(
                RateLimitEvent.created_at < now - timedelta(hours=24)
            )
        )

    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Try again in {window_seconds} seconds.",
        )
