import logging
import uuid as uuid_module
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.models.user import User
from app.models.story import Story
from app.models.story_view import StoryView
from app.models.social_follow import SocialFollow
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stories", tags=["stories"])


class StoryIn(BaseModel):
    photo_url: str
    caption: Optional[str] = None
    oryx_data_overlay_json: Optional[dict] = None
    text_overlay: Optional[str] = None
    checkin_id: Optional[str] = None
    source_post_id: Optional[str] = None


async def _expire_old_stories(db: AsyncSession):
    """Mark expired stories. Called lazily on feed requests."""
    now = datetime.utcnow()
    await db.execute(
        update(Story)
        .where(Story.expires_at <= now, Story.is_expired == False)
        .values(is_expired=True)
    )


def _build_story_dict(story: Story) -> dict:
    return {
        "id": str(story.id),
        "user_id": str(story.user_id),
        "photo_url": story.photo_url,
        "caption": story.caption,
        "oryx_data_overlay_json": story.oryx_data_overlay_json,
        "text_overlay": story.text_overlay,
        "source_post_id": str(story.source_post_id) if story.source_post_id else None,
        "checkin_id": str(story.checkin_id) if story.checkin_id else None,
        "created_at": story.created_at.isoformat(),
        "expires_at": story.expires_at.isoformat(),
        "is_expired": story.is_expired,
    }


def _user_initials(user: User) -> str:
    name = user.display_name or user.username or user.email or ""
    parts = name.split()
    if not parts:
        return "?"
    initials = parts[0][0].upper()
    if len(parts) > 1:
        initials += parts[-1][0].upper()
    return initials


@router.post("")
async def create_story(
    body: StoryIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    story = Story(
        user_id=current_user.id,
        story_type='photo',
        photo_url=body.photo_url,
        caption=body.caption,
        oryx_data_overlay_json=body.oryx_data_overlay_json,
        text_overlay=body.text_overlay,
        checkin_id=uuid_module.UUID(body.checkin_id) if body.checkin_id else None,
        source_post_id=uuid_module.UUID(body.source_post_id) if body.source_post_id else None,
        created_at=now,
        expires_at=now + timedelta(hours=24),
        is_expired=False,
        is_highlight=False,
    )
    db.add(story)
    await db.flush()
    return {"story": _build_story_dict(story)}


@router.get("/feed")
async def get_stories_feed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _expire_old_stories(db)

    # Get following IDs
    following_res = await db.execute(
        select(SocialFollow.following_id).where(SocialFollow.follower_id == current_user.id)
    )
    following_ids = [r for r in following_res.scalars().all()]
    relevant_user_ids = following_ids + [current_user.id]

    # Get active stories
    now = datetime.utcnow()
    stories_res = await db.execute(
        select(Story).where(
            Story.user_id.in_(relevant_user_ids),
            Story.is_expired == False,
            Story.expires_at > now,
        ).order_by(Story.user_id, Story.created_at.asc())
    )
    stories = stories_res.scalars().all()

    if not stories:
        return {"story_groups": []}

    # Get all story IDs this user has viewed
    story_ids = [s.id for s in stories]
    views_res = await db.execute(
        select(StoryView.story_id).where(
            StoryView.viewer_user_id == current_user.id,
            StoryView.story_id.in_(story_ids),
        )
    )
    seen_story_ids = {str(r) for r in views_res.scalars().all()}

    # Get user data
    users_res = await db.execute(select(User).where(User.id.in_(relevant_user_ids)))
    user_map = {str(u.id): u for u in users_res.scalars().all()}

    # Group by user
    groups: dict[str, dict] = {}
    for story in stories:
        uid = str(story.user_id)
        if uid not in groups:
            u = user_map.get(uid)
            groups[uid] = {
                "user_id": uid,
                "display_name": (u.display_name or u.username or "Athlete") if u else "Athlete",
                "initials": _user_initials(u) if u else "?",
                "avatar_url": getattr(u, "avatar_url", None) if u else None,
                "readiness_color": "#555555",
                "has_unseen_story": False,
                "stories": [],
                "is_own": uid == str(current_user.id),
            }
        story_dict = _build_story_dict(story)
        story_dict["is_seen"] = str(story.id) in seen_story_ids
        groups[uid]["stories"].append(story_dict)
        if str(story.id) not in seen_story_ids:
            groups[uid]["has_unseen_story"] = True

    # Sort: own first, then unseen, then seen
    group_list = list(groups.values())
    own = [g for g in group_list if g["is_own"]]
    unseen = [g for g in group_list if not g["is_own"] and g["has_unseen_story"]]
    seen = [g for g in group_list if not g["is_own"] and not g["has_unseen_story"]]
    sorted_groups = own + unseen + seen

    return {"story_groups": sorted_groups}


@router.get("/my")
async def get_my_stories(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the current user's stories. Default: today only (for the story
    composer). When start_date + end_date are supplied (YYYY-MM-DD), returns
    every story in that inclusive range — used by the Create Highlight flow.
    """
    from datetime import date, time
    from sqlalchemy import cast, Date

    conditions = [Story.user_id == current_user.id]

    if start_date or end_date:
        try:
            s = date.fromisoformat(start_date) if start_date else date(1970, 1, 1)
            e = date.fromisoformat(end_date) if end_date else date.today()
        except ValueError:
            raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD")
        start_dt = datetime.combine(s, time.min)
        end_dt = datetime.combine(e, time.max)
        conditions.append(Story.created_at >= start_dt)
        conditions.append(Story.created_at <= end_dt)
    else:
        today = date.today()
        conditions.append(cast(Story.created_at, Date) == today)

    res = await db.execute(
        select(Story).where(*conditions).order_by(Story.created_at.desc())
    )
    stories = res.scalars().all()
    return {"stories": [_build_story_dict(s) for s in stories]}


@router.get("/{story_id}")
async def get_story(
    story_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Story).where(Story.id == story_id))
    story = res.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # Record view if not own story
    if str(story.user_id) != str(current_user.id):
        try:
            view = StoryView(story_id=story.id, viewer_user_id=current_user.id)
            db.add(view)
            await db.flush()
        except Exception:
            await db.rollback()

    # Get author
    author_res = await db.execute(select(User).where(User.id == story.user_id))
    author = author_res.scalar_one_or_none()

    story_dict = _build_story_dict(story)
    story_dict["author"] = {
        "id": str(author.id) if author else None,
        "display_name": (author.display_name or author.username or "Athlete") if author else "Athlete",
        "initials": _user_initials(author) if author else "?",
        "avatar_url": getattr(author, "avatar_url", None) if author else None,
    }
    return {"story": story_dict}


@router.delete("/{story_id}")
async def delete_story(
    story_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Story).where(Story.id == story_id))
    story = res.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if str(story.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your story")
    await db.delete(story)
    await db.flush()
    return {"message": "deleted"}
