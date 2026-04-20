import logging
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.social_follow import SocialFollow
from app.models.social_post import SocialPost
from app.models.user import User
from app.models.user_activity import UserActivity
from app.models.user_block import UserBlock
from app.models.user_report import UserReport
from app.routers.auth import get_current_user
from app.routers.posts import _build_post

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


# ── Pydantic bodies ────────────────────────────────────────────────────────────

class ReportIn(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _compute_streaks(user_id, db: AsyncSession) -> tuple[int, int]:
    """Return (current_streak, best_streak) for non-rest-day activities.

    current_streak: consecutive days ending today or yesterday.
    best_streak:    longest consecutive-day run in the past 365 days.
    """
    today = date.today()
    cutoff = today - timedelta(days=365)
    date_col = cast(UserActivity.logged_at, Date)

    # Fetch all distinct active days in the last 365 days
    res = await db.execute(
        select(func.distinct(date_col).label("d"))
        .where(
            UserActivity.user_id == user_id,
            UserActivity.is_rest_day.is_(False),
            date_col >= cutoff,
        )
        .order_by(date_col.desc())
    )
    active_dates = sorted({row.d for row in res}, reverse=True)

    if not active_dates:
        return 0, 0

    # Current streak: walk backward from today
    current_streak = 0
    check = today
    for d in active_dates:
        if d == check or d == check - timedelta(days=1):
            if d < check:
                check = d
            current_streak += 1
            check = d - timedelta(days=1)
        else:
            break

    # Best streak: scan all active dates ascending
    sorted_asc = sorted(active_dates)
    best = 1
    run = 1
    for i in range(1, len(sorted_asc)):
        if (sorted_asc[i] - sorted_asc[i - 1]).days == 1:
            run += 1
            if run > best:
                best = run
        else:
            run = 1

    return current_streak, max(best, current_streak)


# ── Endpoints ──────────────────────────────────────────────────────────────────

class ProfilePatchIn(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=255)
    sport_tags: Optional[list] = None
    avatar_url: Optional[str] = None
    # Posts tab layout preference — validated against the three supported modes
    post_grid_layout: Optional[Literal['grid', 'portfolio', 'timeline']] = None


@router.patch("/me/profile")
async def update_my_profile(
    body: ProfilePatchIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.bio is not None:
        current_user.bio = body.bio
    if body.location is not None:
        current_user.location = body.location
    if body.sport_tags is not None:
        current_user.sport_tags = body.sport_tags
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.post_grid_layout is not None:
        current_user.post_grid_layout = body.post_grid_layout
    await db.flush()
    return {
        "id": str(current_user.id),
        "display_name": current_user.display_name,
        "bio": current_user.bio,
        "location": current_user.location,
        "sport_tags": current_user.sport_tags or [],
        "avatar_url": current_user.avatar_url,
        "post_grid_layout": current_user.post_grid_layout,
    }


@router.get("/{user_id}/profile")
async def get_user_profile(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return public profile data for any user."""
    target_res = await db.execute(select(User).where(User.id == user_id))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # is_following?
    follow_res = await db.execute(
        select(SocialFollow).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id == user_id,
        )
    )
    is_following = follow_res.scalar_one_or_none() is not None

    # is_blocked?
    block_res = await db.execute(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == user_id,
        )
    )
    is_blocked = block_res.scalar_one_or_none() is not None

    # total_workouts
    total_res = await db.execute(
        select(func.count(UserActivity.id)).where(
            UserActivity.user_id == user_id,
            UserActivity.is_rest_day.is_(False),
        )
    )
    total_workouts = int(total_res.scalar() or 0)

    current_streak, best_streak = await _compute_streaks(user_id, db)

    member_since = target.created_at.strftime("%Y-%m") if target.created_at else None

    return {
        "id": str(target.id),
        "display_name": target.display_name or target.username or "Athlete",
        "username": target.username or "",
        "avatar_url": getattr(target, "avatar_url", None),
        "sport_tags": target.sport_tags or [],
        "location": getattr(target, "location", None),
        "bio": getattr(target, "bio", None),
        "followers_count": target.followers_count or 0,
        "following_count": target.following_count or 0,
        "is_private": getattr(target, "is_private", False) or False,
        "is_following": is_following,
        "is_blocked": is_blocked,
        "total_workouts": total_workouts,
        "current_streak": current_streak,
        "best_streak": best_streak,
        "member_since": member_since,
        "recent_achievements": [],
    }


@router.get("/{user_id}/posts")
async def get_user_posts(
    user_id: str,
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated posts from a user. Respects privacy setting."""
    target_res = await db.execute(select(User).where(User.id == user_id))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    is_private = getattr(target, "is_private", False) or False

    # If private, check if current user follows target (owner can always see their own)
    if is_private and str(current_user.id) != user_id:
        follow_res = await db.execute(
            select(SocialFollow).where(
                SocialFollow.follower_id == current_user.id,
                SocialFollow.following_id == user_id,
            )
        )
        if follow_res.scalar_one_or_none() is None:
            return {"posts": [], "is_private": True, "page": page, "has_more": False}

    posts_res = await db.execute(
        select(SocialPost)
        .where(
            SocialPost.user_id == user_id,
            SocialPost.is_deleted.is_(False),
        )
        .order_by(SocialPost.created_at.desc())
        .offset(page * limit)
        .limit(limit + 1)
    )
    posts = posts_res.scalars().all()
    has_more = len(posts) > limit
    posts = posts[:limit]

    built = []
    for p in posts:
        built.append(await _build_post(p, str(current_user.id), db))

    return {"posts": built, "is_private": False, "page": page, "has_more": has_more}


@router.post("/{user_id}/report")
async def report_user(
    user_id: str,
    body: ReportIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Report a user."""
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")

    target_res = await db.execute(select(User).where(User.id == user_id))
    if not target_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    report = UserReport(
        reporter_id=current_user.id,
        reported_id=user_id,
        reason=body.reason,
    )
    db.add(report)
    await db.flush()
    return {"message": "reported"}


@router.post("/{user_id}/block")
async def block_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Block a user. Also unfollows if currently following."""
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    target_res = await db.execute(select(User).where(User.id == user_id))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Upsert block (ignore if already blocked)
    existing_block_res = await db.execute(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == user_id,
        )
    )
    if not existing_block_res.scalar_one_or_none():
        block = UserBlock(blocker_id=current_user.id, blocked_id=user_id)
        db.add(block)

    # Unfollow if following (current_user → target)
    follow_res = await db.execute(
        select(SocialFollow).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id == user_id,
        )
    )
    follow = follow_res.scalar_one_or_none()
    if follow:
        await db.delete(follow)
        current_user.following_count = max(0, (current_user.following_count or 0) - 1)
        target.followers_count = max(0, (target.followers_count or 0) - 1)

    # Also remove target → current_user follow if it exists
    reverse_follow_res = await db.execute(
        select(SocialFollow).where(
            SocialFollow.follower_id == user_id,
            SocialFollow.following_id == current_user.id,
        )
    )
    reverse_follow = reverse_follow_res.scalar_one_or_none()
    if reverse_follow:
        await db.delete(reverse_follow)
        target.following_count = max(0, (target.following_count or 0) - 1)
        current_user.followers_count = max(0, (current_user.followers_count or 0) - 1)

    await db.flush()
    return {"message": "blocked"}


@router.get("/{user_id}/activity-heatmap")
async def get_activity_heatmap(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return dates with session counts for the last 365 days (non-rest days only)."""
    today = date.today()
    cutoff = today - timedelta(days=365)
    date_col = cast(UserActivity.logged_at, Date)

    res = await db.execute(
        select(date_col.label("d"), func.count(UserActivity.id).label("cnt"))
        .where(
            UserActivity.user_id == user_id,
            UserActivity.is_rest_day.is_(False),
            date_col >= cutoff,
        )
        .group_by(date_col)
        .order_by(date_col)
    )
    rows = res.all()
    return {
        "heatmap": [
            {"date": str(row.d), "session_count": row.cnt}
            for row in rows
        ]
    }


@router.get("/{user_id}/personal-bests")
async def get_personal_bests(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return personal bests from activity data."""
    res = await db.execute(
        select(
            func.max(UserActivity.distance_meters).label("max_distance_meters"),
            func.max(UserActivity.calories_burned).label("max_calories_burned"),
            func.max(UserActivity.duration_minutes).label("max_duration_minutes"),
            func.max(UserActivity.training_load).label("max_training_load"),
            func.max(UserActivity.rpe).label("max_rpe"),
        ).where(
            UserActivity.user_id == user_id,
            UserActivity.is_rest_day.is_(False),
        )
    )
    row = res.one_or_none()
    if row is None:
        return {
            "longest_distance_km": None,
            "max_calories_burned": None,
            "longest_duration_minutes": None,
            "max_training_load": None,
            "max_rpe": None,
        }

    longest_distance_km = (
        round(float(row.max_distance_meters) / 1000, 2)
        if row.max_distance_meters is not None
        else None
    )
    return {
        "longest_distance_km": longest_distance_km,
        "max_calories_burned": float(row.max_calories_burned) if row.max_calories_burned is not None else None,
        "longest_duration_minutes": int(row.max_duration_minutes) if row.max_duration_minutes is not None else None,
        "max_training_load": int(row.max_training_load) if row.max_training_load is not None else None,
        "max_rpe": int(row.max_rpe) if row.max_rpe is not None else None,
    }


@router.delete("/{user_id}/block")
async def unblock_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unblock a user."""
    block_res = await db.execute(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == user_id,
        )
    )
    block = block_res.scalar_one_or_none()
    if not block:
        return {"message": "not blocked"}
    await db.delete(block)
    await db.flush()
    return {"message": "unblocked"}
