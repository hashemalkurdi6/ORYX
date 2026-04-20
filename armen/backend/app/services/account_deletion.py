"""Account deletion service — soft-delete, restore, and hard-delete flows.

Soft delete: set delete_requested_at=now, deleted_at=now+grace_days. User
loses all API access immediately (see get_current_user).

Restore: clears both timestamps within the grace window.

Hard delete: removes the user row and every child row across the schema.
Some child tables have FK ON DELETE CASCADE — we still issue explicit
DELETEs for safety and for cases where no FK exists (e.g. post_reports).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.account_deletion_event import AccountDeletionEvent
from app.models.user import User

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _log_event(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    event_type: str,
    ip: str | None = None,
    ua: str | None = None,
    extra: dict | None = None,
) -> None:
    event = AccountDeletionEvent(
        user_id=user_id,
        event_type=event_type,
        ip_address=ip,
        user_agent=ua,
        extra_metadata=extra,
    )
    db.add(event)


async def soft_delete_user(
    user: User,
    db: AsyncSession,
    *,
    grace_days: int | None = None,
    ip: str | None,
    ua: str | None,
) -> None:
    """Mark a user for deletion. Caller handles flush/commit."""
    now = _utcnow()
    days = grace_days if grace_days is not None else settings.ACCOUNT_DELETION_GRACE_DAYS
    user.delete_requested_at = now
    user.deleted_at = now + timedelta(days=days)
    await _log_event(
        db,
        user_id=user.id,
        event_type="delete_requested",
        ip=ip,
        ua=ua,
        extra={"grace_days": days},
    )


async def restore_user(
    user: User,
    db: AsyncSession,
    *,
    ip: str | None,
    ua: str | None,
) -> None:
    user.delete_requested_at = None
    user.deleted_at = None
    await _log_event(
        db, user_id=user.id, event_type="restored", ip=ip, ua=ua
    )


# Ordered list of (sql, description). Children first. All run in one txn.
_HARD_DELETE_STATEMENTS: list[str] = [
    # Social engagement children of social_posts (delete user's own rows first)
    "DELETE FROM social_reactions WHERE user_id = :uid",
    "DELETE FROM social_comments WHERE user_id = :uid",
    "DELETE FROM posts_likes WHERE user_id = :uid",
    "DELETE FROM saved_posts WHERE user_id = :uid",
    "DELETE FROM hidden_posts WHERE user_id = :uid",
    "DELETE FROM post_views WHERE viewer_user_id = :uid",
    # post_reports uses TEXT columns — cast explicitly
    "DELETE FROM post_reports WHERE reporter_user_id = :uid_text",
    # Cascade through the user's posts: reactions/comments/likes/saves/views/stories
    "DELETE FROM social_reactions WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = :uid)",
    "DELETE FROM social_comments WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = :uid)",
    "DELETE FROM posts_likes WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = :uid)",
    "DELETE FROM saved_posts WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = :uid)",
    "DELETE FROM hidden_posts WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = :uid)",
    "DELETE FROM post_views WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = :uid)",
    "DELETE FROM social_posts WHERE user_id = :uid",
    # Stories
    "DELETE FROM story_views WHERE viewer_user_id = :uid",
    "DELETE FROM story_views WHERE story_id IN (SELECT id FROM stories WHERE user_id = :uid)",
    "DELETE FROM stories WHERE user_id = :uid",
    # Other social / profile data
    "DELETE FROM highlights WHERE user_id = :uid",
    "DELETE FROM daily_checkins WHERE user_id = :uid",
    "DELETE FROM club_memberships WHERE user_id = :uid",
    "DELETE FROM user_blocks WHERE blocker_id = :uid OR blocked_id = :uid",
    "DELETE FROM user_reports WHERE reporter_id = :uid OR reported_id = :uid",
    "DELETE FROM social_follows WHERE follower_id = :uid OR following_id = :uid",
    # Messaging — delete the user's messages, then participants, then empty convos
    "DELETE FROM messages WHERE sender_id = :uid",
    "DELETE FROM conversation_participants WHERE user_id = :uid",
    # Drop conversations that now have zero participants
    "DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants)",
    # Wellness / nutrition / activity
    "DELETE FROM wellness_checkins WHERE user_id = :uid",
    "DELETE FROM weight_logs WHERE user_id = :uid",
    "DELETE FROM daily_water_intake WHERE user_id = :uid",
    "DELETE FROM daily_steps WHERE user_id = :uid",
    "DELETE FROM nutrition_logs WHERE user_id = :uid",
    "DELETE FROM meal_plans WHERE user_id = :uid",
    "DELETE FROM nutrition_profiles WHERE user_id = :uid",
    "DELETE FROM nutrition_targets WHERE user_id = :uid",
    "DELETE FROM custom_foods WHERE user_id = :uid",
    "DELETE FROM daily_nutrition_summaries WHERE user_id = :uid",
    "DELETE FROM activities WHERE user_id = :uid",
    "DELETE FROM user_activities WHERE user_id = :uid",
    "DELETE FROM hevy_workouts WHERE user_id = :uid",
    "DELETE FROM whoop_data WHERE user_id = :uid",
    "DELETE FROM oura_data WHERE user_id = :uid",
    "DELETE FROM health_data WHERE user_id = :uid",
    "DELETE FROM diagnoses WHERE user_id = :uid",
    "DELETE FROM readiness_cache WHERE user_id = :uid",
    # Finally the user row itself
    "DELETE FROM users WHERE id = :uid",
]


async def hard_delete_user(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Remove the user and all owned rows. Caller wraps in a transaction.

    Uses best-effort DELETEs: if a table doesn't exist in this environment
    (schema drift), the statement is skipped rather than failing.
    """
    params = {"uid": str(user_id), "uid_text": str(user_id)}
    for sql in _HARD_DELETE_STATEMENTS:
        try:
            await db.execute(text(sql), params)
        except Exception as exc:  # noqa: BLE001
            # Don't fail the whole deletion because one optional table is missing.
            logger.warning("hard_delete_user: statement failed (%s): %s", sql, exc)
            # Re-raise for the users-row deletion — that must succeed.
            if "FROM users WHERE id" in sql:
                raise
    # Log the hard-delete event AFTER the user row is gone. Event table has
    # no FK to users, so the audit trail survives.
    await _log_event(db, user_id=user_id, event_type="hard_deleted")


async def hard_delete_expired_users(db: AsyncSession) -> int:
    """Hard-delete every user whose grace window has elapsed.

    Commits after each user to keep transactions small. Returns the count
    of users actually deleted.
    """
    now = _utcnow()
    result = await db.execute(
        text("SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < :now"),
        {"now": now},
    )
    rows = result.fetchall()
    count = 0
    for row in rows:
        uid = row[0]
        if not isinstance(uid, uuid.UUID):
            uid = uuid.UUID(str(uid))
        try:
            await hard_delete_user(uid, db)
            await db.commit()
            count += 1
        except Exception:  # noqa: BLE001
            await db.rollback()
            logger.exception("hard_delete_expired_users: failed for user_id=%s", uid)
    return count
