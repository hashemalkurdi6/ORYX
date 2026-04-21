import logging
import random
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.database import get_db
from app.models.user import User
from app.models.daily_checkin import DailyCheckin
from app.models.social_post import SocialPost
from app.routers.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/checkin", tags=["checkin"])

WINDOW_MINUTES = 10


class CheckinIn(BaseModel):
    photo_url: str | None = None
    caption: str | None = None
    stats_overlay_json: dict | None = None
    influence_tags: list[str] | None = None
    is_public: bool = True


class CaptionIn(BaseModel):
    name: str
    readiness: int | None = None
    steps: int | None = None
    calories_consumed: int | None = None
    calories_target: int | None = None
    session_name: str | None = None
    sport_tags: list[str] | None = None
    time_of_day: str | None = None


@router.get("/today")
async def get_today_checkin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's check-in status. Creates a window if none exists and time is valid."""
    from app.services.user_time import user_today
    today = user_today(current_user)
    date_col = cast(DailyCheckin.created_at, Date)

    checkin_res = await db.execute(
        select(DailyCheckin).where(
            DailyCheckin.user_id == current_user.id,
            date_col == today,
        ).order_by(DailyCheckin.created_at.desc())
    )
    checkin = checkin_res.scalar_one_or_none()

    now = datetime.utcnow()

    if checkin is None:
        window_expires_at = now + timedelta(minutes=WINDOW_MINUTES)
        checkin = DailyCheckin(
            user_id=current_user.id,
            window_expires_at=window_expires_at,
        )
        db.add(checkin)
        await db.flush()

    if checkin is None:
        return {"has_checkin": False, "window_active": False, "window_expires_at": None, "checkin": None}

    window_active = (
        checkin.photo_url is None
        and checkin.window_expires_at is not None
        and checkin.window_expires_at > now
    )
    has_checkin = checkin.photo_url is not None

    return {
        "has_checkin": has_checkin,
        "window_active": window_active,
        "window_expires_at": checkin.window_expires_at.isoformat() if checkin.window_expires_at else None,
        "checkin": {
            "id": str(checkin.id),
            "photo_url": checkin.photo_url,
            "caption": checkin.caption,
            "stats_overlay_json": checkin.stats_overlay_json,
            "influence_tags": checkin.influence_tags,
            "created_at": checkin.created_at.isoformat(),
        } if has_checkin else None,
    }


@router.post("")
async def save_checkin(
    body: CheckinIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save the daily check-in and create a post."""
    from app.services.user_time import user_today
    today = user_today(current_user)
    date_col = cast(DailyCheckin.created_at, Date)
    existing_res = await db.execute(
        select(DailyCheckin).where(
            DailyCheckin.user_id == current_user.id,
            date_col == today,
        )
    )
    checkin = existing_res.scalar_one_or_none()

    if checkin is None:
        checkin = DailyCheckin(user_id=current_user.id)
        db.add(checkin)

    checkin.photo_url = body.photo_url
    checkin.caption = body.caption
    checkin.stats_overlay_json = body.stats_overlay_json
    checkin.influence_tags = body.influence_tags

    # Create social post
    post = SocialPost(
        user_id=current_user.id,
        oryx_data_card_json={
            "post_type": "daily_checkin",
            "checkin_id": None,  # filled after flush
            "influence_tags": body.influence_tags or [],
            "stats": body.stats_overlay_json or {},
        },
        photo_url=body.photo_url,
        caption=body.caption,
        is_deleted=False,
    )
    db.add(post)
    await db.flush()

    checkin.post_id = post.id
    post.oryx_data_card_json = {
        "post_type": "daily_checkin",
        "checkin_id": str(checkin.id),
        "influence_tags": body.influence_tags or [],
        "stats": body.stats_overlay_json or {},
    }
    await db.flush()

    # Auto-create a story for this check-in
    from app.models.story import Story
    story = Story(
        user_id=current_user.id,
        photo_url=body.photo_url,
        caption=body.caption,
        oryx_data_overlay_json=body.stats_overlay_json,
        checkin_id=checkin.id,
        source_post_id=post.id,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(story)
    await db.flush()

    return {
        "checkin": {
            "id": str(checkin.id),
            "photo_url": checkin.photo_url,
            "caption": checkin.caption,
            "stats_overlay_json": checkin.stats_overlay_json,
            "influence_tags": checkin.influence_tags,
            "created_at": checkin.created_at.isoformat(),
        },
        "post_id": str(post.id),
    }


@router.delete("/today")
async def delete_today_checkin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete today's check-in photo, post, and story."""
    from app.services.user_time import user_today
    today = user_today(current_user)
    date_col = cast(DailyCheckin.created_at, Date)
    existing_res = await db.execute(
        select(DailyCheckin).where(
            DailyCheckin.user_id == current_user.id,
            date_col == today,
        )
    )
    checkin = existing_res.scalar_one_or_none()
    if not checkin:
        raise HTTPException(status_code=404, detail="No check-in today")
    if not checkin.photo_url:
        raise HTTPException(status_code=400, detail="No photo to delete")

    # Delete the linked post (cascade deletes the story via posts router logic)
    if checkin.post_id:
        post_res = await db.execute(select(SocialPost).where(SocialPost.id == checkin.post_id))
        post = post_res.scalar_one_or_none()
        if post:
            from app.models.story import Story
            stories_res = await db.execute(select(Story).where(Story.source_post_id == post.id))
            for story in stories_res.scalars().all():
                await db.delete(story)
            await db.delete(post)

    checkin.photo_url = None
    checkin.caption = None
    checkin.stats_overlay_json = None
    checkin.influence_tags = None
    checkin.post_id = None
    await db.flush()
    return {"message": "deleted"}


@router.post("/caption")
async def generate_caption(
    body: CaptionIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI caption for the check-in using OpenAI gpt-4o-mini."""
    if not settings.OPENAI_API_KEY:
        return {"caption": f"Checking in — staying consistent! 💪"}

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        user_msg = (
            f"Athlete: {body.name}, "
            f"Time: {body.time_of_day or 'unknown'}, "
            f"Readiness: {body.readiness or 'N/A'}/100, "
            f"Steps: {body.steps or 0}, "
            f"Calories: {body.calories_consumed or 0}/{body.calories_target or 0}, "
            f"Training today: {body.session_name or 'none'}, "
            f"Sport: {', '.join(body.sport_tags or ['general fitness'])}"
        )

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a witty and relatable fitness companion. Generate a one line caption for a fitness check-in photo based on the athlete's current stats. "
                        "Be genuine and specific. Use the athlete's first name. Keep it under 15 words. "
                        "Match the energy to their readiness score — high readiness (70+) gets an energetic caption, "
                        "low readiness (<40) gets a recovery-focused caption, medium gets a steady caption. "
                        "Never be cringe or overly motivational. No hashtags. No emojis."
                    ),
                },
                {"role": "user", "content": user_msg},
            ],
            max_tokens=60,
            temperature=0.9,
        )
        caption = response.choices[0].message.content.strip().strip('"')
        return {"caption": caption}
    except Exception as e:
        logger.warning("Caption generation failed: %s", e)
        return {"caption": f"{body.name} is putting in the work today."}
