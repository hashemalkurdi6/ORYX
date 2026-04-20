"""Background scheduler for account-deletion sweeping.

Runs as an asyncio task spawned from the FastAPI lifespan. On each tick
(every 6 hours) it finds users whose grace window has elapsed and
hard-deletes them.
"""

from __future__ import annotations

import asyncio
import logging

from app.database import AsyncSessionLocal
from app.services.account_deletion import hard_delete_expired_users

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 6 * 3600


async def run_deletion_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            async with AsyncSessionLocal() as db:
                count = await hard_delete_expired_users(db)
                if count > 0:
                    logger.info("Hard-deleted %d expired user(s)", count)
        except Exception:  # noqa: BLE001
            logger.exception("deletion sweeper error")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=SWEEP_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass
