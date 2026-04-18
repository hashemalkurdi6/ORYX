import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.social_follow import SocialFollow
from app.models.user_block import UserBlock
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/social", tags=["social"])


def _user_preview(user: User, is_following: bool = False) -> dict:
    initials = ""
    name = user.display_name or user.username or user.email or ""
    parts = name.split()
    if parts:
        initials = parts[0][0].upper()
        if len(parts) > 1:
            initials += parts[-1][0].upper()
    return {
        "id": str(user.id),
        "display_name": user.display_name or user.username or "Athlete",
        "username": user.username or "",
        "sport_tags": user.sport_tags or [],
        "avatar_url": getattr(user, "avatar_url", None),
        "initials": initials,
        "followers_count": user.followers_count or 0,
        "following_count": user.following_count or 0,
        "is_following": is_following,
    }


@router.post("/follow/{user_id}")
async def follow_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    target_res = await db.execute(select(User).where(User.id == user_id))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing_res = await db.execute(
        select(SocialFollow).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id == user_id,
        )
    )
    if existing_res.scalar_one_or_none():
        return {"message": "already following"}

    follow = SocialFollow(follower_id=current_user.id, following_id=user_id)
    db.add(follow)
    current_user.following_count = (current_user.following_count or 0) + 1
    target.followers_count = (target.followers_count or 0) + 1
    await db.flush()
    return {"message": "followed", "following_count": current_user.following_count, "target_followers_count": target.followers_count}


@router.delete("/follow/{user_id}")
async def unfollow_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(SocialFollow).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id == user_id,
        )
    )
    follow = res.scalar_one_or_none()
    if not follow:
        return {"message": "not following"}
    await db.delete(follow)
    current_user.following_count = max(0, (current_user.following_count or 0) - 1)
    target_res = await db.execute(select(User).where(User.id == user_id))
    target = target_res.scalar_one_or_none()
    if target:
        target.followers_count = max(0, (target.followers_count or 0) - 1)
    await db.flush()
    return {"message": "unfollowed", "following_count": current_user.following_count}


@router.get("/followers")
async def get_followers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    follows_res = await db.execute(
        select(SocialFollow).where(SocialFollow.following_id == current_user.id)
    )
    follows = follows_res.scalars().all()
    follower_ids = [f.follower_id for f in follows]
    if not follower_ids:
        return {"followers": []}

    # Check who current user follows back
    back_res = await db.execute(
        select(SocialFollow.following_id).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id.in_([str(fid) for fid in follower_ids]),
        )
    )
    following_back = {str(r) for r in back_res.scalars().all()}

    users_res = await db.execute(select(User).where(User.id.in_(follower_ids)))
    users = users_res.scalars().all()
    return {"followers": [_user_preview(u, str(u.id) in following_back) for u in users]}


@router.get("/following")
async def get_following(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    follows_res = await db.execute(
        select(SocialFollow).where(SocialFollow.follower_id == current_user.id)
    )
    follows = follows_res.scalars().all()
    following_ids = [f.following_id for f in follows]
    if not following_ids:
        return {"following": []}
    users_res = await db.execute(select(User).where(User.id.in_(following_ids)))
    users = users_res.scalars().all()
    return {"following": [_user_preview(u, True) for u in users]}


@router.get("/followers/{user_id}")
async def get_user_followers(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return followers of the given user_id."""
    follows_res = await db.execute(
        select(SocialFollow).where(SocialFollow.following_id == user_id)
    )
    follows = follows_res.scalars().all()
    follower_ids = [f.follower_id for f in follows]
    if not follower_ids:
        return {"followers": []}

    # Check which of these the current user follows back
    back_res = await db.execute(
        select(SocialFollow.following_id).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id.in_([str(fid) for fid in follower_ids]),
        )
    )
    following_back = {str(r) for r in back_res.scalars().all()}

    users_res = await db.execute(select(User).where(User.id.in_(follower_ids)))
    users = users_res.scalars().all()
    return {"followers": [_user_preview(u, str(u.id) in following_back) for u in users]}


@router.get("/following/{user_id}")
async def get_user_following(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return users that the given user_id follows."""
    follows_res = await db.execute(
        select(SocialFollow).where(SocialFollow.follower_id == user_id)
    )
    follows = follows_res.scalars().all()
    following_ids = [f.following_id for f in follows]
    if not following_ids:
        return {"following": []}

    # Check which of these the current user follows
    my_follows_res = await db.execute(
        select(SocialFollow.following_id).where(
            SocialFollow.follower_id == current_user.id,
            SocialFollow.following_id.in_([str(fid) for fid in following_ids]),
        )
    )
    i_follow = {str(r) for r in my_follows_res.scalars().all()}

    users_res = await db.execute(select(User).where(User.id.in_(following_ids)))
    users = users_res.scalars().all()
    return {"following": [_user_preview(u, str(u.id) in i_follow) for u in users]}


@router.get("/suggestions")
async def get_suggestions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Suggest users with overlapping sport_tags who current user doesn't follow."""
    follows_res = await db.execute(
        select(SocialFollow.following_id).where(SocialFollow.follower_id == current_user.id)
    )
    already_following = {str(r) for r in follows_res.scalars().all()}
    already_following.add(str(current_user.id))

    users_res = await db.execute(select(User).where(User.id != current_user.id))
    all_users = users_res.scalars().all()

    my_tags = set(current_user.sport_tags or [])
    scored = []
    for u in all_users:
        if str(u.id) in already_following:
            continue
        their_tags = set(u.sport_tags or [])
        overlap = len(my_tags & their_tags)
        if overlap > 0 or not my_tags:
            scored.append((overlap, u))
    scored.sort(key=lambda x: -x[0])
    return {"suggestions": [_user_preview(u) for _, u in scored[:20]]}


@router.get("/search")
async def search_users(
    q: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if len(q) < 2:
        return {"users": []}
    follows_res = await db.execute(
        select(SocialFollow.following_id).where(SocialFollow.follower_id == current_user.id)
    )
    following_ids = {str(r) for r in follows_res.scalars().all()}

    # Exclude users the current user has blocked
    blocked_res = await db.execute(
        select(UserBlock.blocked_id).where(UserBlock.blocker_id == current_user.id)
    )
    blocked_ids = {str(r) for r in blocked_res.scalars().all()}

    q_lower = q.lower()
    users_res = await db.execute(
        select(User).where(
            User.id != current_user.id,
        ).limit(30)
    )
    all_users = users_res.scalars().all()
    matched = [
        u for u in all_users
        if str(u.id) not in blocked_ids
        and (
            q_lower in (u.display_name or "").lower()
            or q_lower in (u.username or "").lower()
        )
    ]
    return {
        "users": [_user_preview(u, str(u.id) in following_ids) for u in matched[:20]]
    }
