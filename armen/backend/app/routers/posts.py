import asyncio
import logging
import uuid as uuid_module
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import cast, Date, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import AsyncSessionLocal, get_db
from app.models.user import User
from app.models.social_post import SocialPost
from app.models.social_reaction import SocialReaction
from app.models.social_comment import SocialComment
from app.models.saved_post import SavedPost
from app.models.hidden_post import HiddenPost
from app.models.post_view import PostView
from app.models.post_like import PostLike
from app.models.comment_like import CommentLike
from app.routers.auth import get_current_user
from app.services.user_visibility import active_user_ids_subquery

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/posts", tags=["posts"])


class PostIn(BaseModel):
    photo_url: Optional[str] = None
    caption: Optional[str] = None
    oryx_data_card_json: Optional[dict] = None
    also_shared_as_story: bool = False
    club_id: Optional[str] = None
    insight_type: Optional[str] = None      # "workout"|"daily_insight"|"weekly_recap"|"nutrition"|"text"
    session_id: Optional[str] = None        # UUID of linked UserActivity
    custom_title: Optional[str] = Field(None, max_length=40)
    location_text: Optional[str] = Field(None, max_length=50)
    privacy_settings: Optional[dict] = None # boolean flags controlling what is shown
    background_style: Optional[str] = None  # "dark_solid"|"mountain"|"forest"|"ocean"|"aurora"|"warm_dark"


class PostPatchIn(BaseModel):
    caption: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class CommentIn(BaseModel):
    comment_text: str
    parent_comment_id: Optional[str] = None


class CommentPatchIn(BaseModel):
    comment_text: str


class PostReportIn(BaseModel):
    reason: Optional[str] = None


def _user_initials(user: User) -> str:
    name = user.display_name or user.username or user.email or ""
    parts = name.split()
    if not parts:
        return "?"
    initials = parts[0][0].upper()
    if len(parts) > 1:
        initials += parts[-1][0].upper()
    return initials


def _time_ago(dt: datetime) -> str:
    diff = datetime.utcnow() - dt
    s = int(diff.total_seconds())
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m"
    if s < 86400:
        return f"{s // 3600}h"
    return f"{s // 86400}d"


def _serialize_post(
    post: SocialPost,
    author: Optional[User],
    reaction_counts: dict,
    my_reactions: set,
    comment_count: int,
    like_count: int,
    is_liked: bool,
    is_saved: bool,
) -> dict:
    card = post.oryx_data_card_json or {}
    return {
        "id": str(post.id),
        "photo_url": post.photo_url,
        "caption": post.caption,
        "oryx_data_card_json": post.oryx_data_card_json,
        "also_shared_as_story": post.also_shared_as_story,
        "story_id": str(post.story_id) if post.story_id else None,
        "club_id": str(post.club_id) if post.club_id else None,
        "is_deleted": post.is_deleted,
        "is_pinned": post.is_pinned or False,
        "is_archived": post.is_archived or False,
        "created_at": post.created_at.isoformat(),
        "time_ago": _time_ago(post.created_at),
        "author": {
            "id": str(author.id) if author else None,
            "display_name": (author.display_name or author.username or "Athlete") if author else "Athlete",
            "username": (author.username or "") if author else "",
            "avatar_url": getattr(author, "avatar_url", None) if author else None,
            "initials": _user_initials(author) if author else "?",
            "sport_tags": (author.sport_tags or []) if author else [],
        },
        "reactions": {
            "fire": reaction_counts.get("fire", 0),
            "muscle": reaction_counts.get("muscle", 0),
            "heart": reaction_counts.get("heart", 0),
        },
        "my_reactions": list(my_reactions),
        "comment_count": comment_count,
        "like_count": like_count,
        "is_liked_by_current_user": is_liked,
        "is_saved": is_saved,
        "insight_type": card.get("insight_type"),
        "session_id": card.get("session_id"),
        "custom_title": card.get("custom_title"),
        "location_text": card.get("location_text"),
        "privacy_settings": card.get("privacy_settings"),
        "background_style": card.get("background_style"),
    }


async def _build_posts(posts: list[SocialPost], current_user_id: str, db: AsyncSession) -> list[dict]:
    """Batched counterpart to `_build_post` — one query per aggregate across all
    posts instead of 7 queries per post. The 7 aggregates are independent, so
    they fan out in parallel on separate sessions (a single AsyncSession does
    not support concurrent execute() calls)."""
    if not posts:
        return []

    post_ids = [p.id for p in posts]
    author_ids = list({p.user_id for p in posts})

    authors_q = select(User).where(User.id.in_(author_ids))
    reactions_q = (
        select(
            SocialReaction.post_id,
            SocialReaction.reaction_type,
            func.count(SocialReaction.id),
        )
        .where(SocialReaction.post_id.in_(post_ids))
        .group_by(SocialReaction.post_id, SocialReaction.reaction_type)
    )
    my_react_q = select(SocialReaction.post_id, SocialReaction.reaction_type).where(
        SocialReaction.post_id.in_(post_ids),
        SocialReaction.user_id == current_user_id,
    )
    cc_q = (
        select(SocialComment.post_id, func.count(SocialComment.id))
        .where(SocialComment.post_id.in_(post_ids))
        .group_by(SocialComment.post_id)
    )
    lc_q = (
        select(PostLike.post_id, func.count(PostLike.id))
        .where(PostLike.post_id.in_(post_ids))
        .group_by(PostLike.post_id)
    )
    my_likes_q = select(PostLike.post_id).where(
        PostLike.post_id.in_(post_ids),
        PostLike.user_id == current_user_id,
    )
    my_saves_q = select(SavedPost.post_id).where(
        SavedPost.post_id.in_(post_ids),
        SavedPost.user_id == current_user_id,
    )

    async def _q(query, mode: str = "rows"):
        async with AsyncSessionLocal() as s:
            res = await s.execute(query)
            if mode == "scalars_all":
                return res.scalars().all()
            return list(res)

    (
        authors,
        reaction_rows,
        my_react_rows,
        cc_rows,
        lc_rows,
        liked_ids_raw,
        saved_ids_raw,
    ) = await asyncio.gather(
        _q(authors_q, "scalars_all"),
        _q(reactions_q),
        _q(my_react_q),
        _q(cc_q),
        _q(lc_q),
        _q(my_likes_q, "scalars_all"),
        _q(my_saves_q, "scalars_all"),
    )

    authors_by_id = {a.id: a for a in authors}

    reactions_by_post: dict = {}
    for post_id, rtype, cnt in reaction_rows:
        reactions_by_post.setdefault(post_id, {})[rtype] = cnt

    my_reactions_by_post: dict = {}
    for post_id, rtype in my_react_rows:
        my_reactions_by_post.setdefault(post_id, set()).add(rtype)

    comment_counts = {pid: int(cnt) for pid, cnt in cc_rows}
    like_counts = {pid: int(cnt) for pid, cnt in lc_rows}
    liked_post_ids = set(liked_ids_raw)
    saved_post_ids = set(saved_ids_raw)

    return [
        _serialize_post(
            p,
            authors_by_id.get(p.user_id),
            reactions_by_post.get(p.id, {}),
            my_reactions_by_post.get(p.id, set()),
            comment_counts.get(p.id, 0),
            like_counts.get(p.id, 0),
            p.id in liked_post_ids,
            p.id in saved_post_ids,
        )
        for p in posts
    ]


async def _build_post(post: SocialPost, current_user_id: str, db: AsyncSession) -> dict:
    built = await _build_posts([post], current_user_id, db)
    return built[0]


@router.post("")
async def create_post(
    body: PostIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Merge insight card metadata into oryx_data_card_json
    card_json: dict = dict(body.oryx_data_card_json or {})
    if body.insight_type is not None:
        # Store under BOTH keys for now: `post_type` is what the feed filter + mobile
        # UI read, `insight_type` is legacy. Migrate readers to `post_type` then drop.
        card_json["insight_type"] = body.insight_type
        card_json["post_type"] = body.insight_type
    if body.session_id is not None:
        card_json["session_id"] = str(body.session_id)
    if body.custom_title is not None:
        card_json["custom_title"] = body.custom_title
    if body.location_text is not None:
        card_json["location_text"] = body.location_text
    if body.privacy_settings is not None:
        card_json["privacy_settings"] = body.privacy_settings
    if body.background_style is not None:
        card_json["background_style"] = body.background_style

    post = SocialPost(
        user_id=current_user.id,
        photo_url=body.photo_url,
        caption=body.caption,
        oryx_data_card_json=card_json if card_json else None,
        also_shared_as_story=body.also_shared_as_story,
        club_id=uuid_module.UUID(body.club_id) if body.club_id else None,
        is_deleted=False,
    )
    db.add(post)
    await db.flush()

    # Auto-create a story if requested and photo is present
    if body.also_shared_as_story and body.photo_url:
        from app.models.story import Story
        now = datetime.utcnow()
        story = Story(
            user_id=current_user.id,
            story_type='photo',
            is_highlight=False,
            photo_url=body.photo_url,
            caption=body.caption,
            source_post_id=post.id,
            created_at=now,
            expires_at=now + timedelta(hours=24),
            is_expired=False,
        )
        db.add(story)
        await db.flush()
        post.story_id = story.id
        await db.flush()

    built = await _build_post(post, str(current_user.id), db)
    return {"post": built}


@router.get("/user/{user_id}")
async def get_user_posts(
    user_id: str,
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all non-deleted posts for a user's profile grid, paginated."""
    # If target user is soft-deleted, hide their posts from everyone (including self-views? no — self views go through profile flows; here we treat it as gone).
    if str(user_id) != str(current_user.id):
        target_res = await db.execute(select(User).where(User.id == user_id))
        target = target_res.scalar_one_or_none()
        if not target or target.delete_requested_at is not None:
            raise HTTPException(status_code=404, detail="User not found")
    posts_res = await db.execute(
        select(SocialPost)
        .where(
            SocialPost.user_id == user_id,
            SocialPost.is_deleted == False,
        )
        .order_by(SocialPost.created_at.desc())
        .offset(page * limit)
        .limit(limit + 1)
    )
    posts = posts_res.scalars().all()
    has_more = len(posts) > limit
    posts = posts[:limit]

    built = await _build_posts(list(posts), str(current_user.id), db)

    return {"posts": built, "page": page, "has_more": has_more}


@router.get("/insight-data")
async def get_insight_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all data needed to build any insight card for the current user."""
    from app.models.diagnosis import Diagnosis
    from app.models.user_activity import UserActivity
    from app.models.daily_nutrition_summary import DailyNutritionSummary
    from app.models.readiness_cache import ReadinessCache
    from app.services.readiness_service import calculate_readiness

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    date_col = cast(UserActivity.logged_at, Date)

    # ── Readiness ──────────────────────────────────────────────────────────────
    readiness = await calculate_readiness(current_user.id, db)
    current_readiness = {
        "score": readiness.get("score"),
        "label": readiness.get("label", ""),
        "color": readiness.get("color", ""),
    }

    # ── Today's diagnosis ──────────────────────────────────────────────────────
    diag_res = await db.execute(
        select(Diagnosis)
        .where(Diagnosis.user_id == current_user.id, Diagnosis.date == today)
        .order_by(Diagnosis.generated_at.desc())
        .limit(1)
    )
    diag = diag_res.scalar_one_or_none()
    today_diagnosis = {
        "diagnosis_text": diag.diagnosis_text if diag else None,
        "contributing_factors": diag.contributing_factors if diag else [],
        "recommendation": diag.recommendation if diag else None,
        "readiness_score": readiness.get("score"),
    }

    # ── Last session ───────────────────────────────────────────────────────────
    last_sess_res = await db.execute(
        select(UserActivity)
        .where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
        )
        .order_by(UserActivity.logged_at.desc())
        .limit(1)
    )
    last_sess = last_sess_res.scalar_one_or_none()
    last_session = None
    if last_sess:
        last_session = {
            "id": str(last_sess.id),
            "activity_type": last_sess.activity_type,
            "sport_category": last_sess.sport_category,
            "duration_minutes": last_sess.duration_minutes,
            "training_load": last_sess.training_load,
            "rpe": last_sess.rpe,
            "autopsy_text": last_sess.autopsy_text,
            "logged_at": last_sess.logged_at.isoformat(),
            "source": "manual",
        }

    # ── Recent sessions (last 20) ──────────────────────────────────────────────
    recent_res = await db.execute(
        select(UserActivity)
        .where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
        )
        .order_by(UserActivity.logged_at.desc())
        .limit(20)
    )
    recent_sessions = [
        {
            "id": str(s.id),
            "activity_type": s.activity_type,
            "sport_category": s.sport_category,
            "duration_minutes": s.duration_minutes,
            "training_load": s.training_load,
            "rpe": s.rpe,
            "logged_at": s.logged_at.isoformat(),
            "source": "manual",
        }
        for s in recent_res.scalars().all()
    ]

    # ── Weekly recap ───────────────────────────────────────────────────────────
    week_sessions_res = await db.execute(
        select(func.count(UserActivity.id)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= week_start,
        )
    )
    week_sessions = int(week_sessions_res.scalar() or 0)

    week_load_res = await db.execute(
        select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= week_start,
        )
    )
    week_total_load = int(week_load_res.scalar() or 0)

    # Average readiness this week from readiness_cache (single value, best we can do without history)
    readiness_cache_res = await db.execute(
        select(ReadinessCache).where(ReadinessCache.user_id == current_user.id)
    )
    readiness_cache = readiness_cache_res.scalar_one_or_none()
    avg_readiness = readiness_cache.score if readiness_cache else None

    # Calories-hit days this week: days where a DailyNutritionSummary row exists and calories_consumed > 0
    cal_days_res = await db.execute(
        select(func.count(DailyNutritionSummary.date)).where(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date >= week_start,
            DailyNutritionSummary.calories_consumed > 0,
        )
    )
    calories_hit_days = int(cal_days_res.scalar() or 0)

    weekly_recap = {
        "sessions": week_sessions,
        "total_load": week_total_load,
        "avg_readiness": avg_readiness,
        "calories_hit_days": calories_hit_days,
    }

    # ── Today's nutrition ──────────────────────────────────────────────────────
    nutr_res = await db.execute(
        select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date == today,
        )
    )
    nutr = nutr_res.scalar_one_or_none()

    # Calorie target from nutrition_targets or user profile
    calorie_target: int | None = None
    try:
        from app.models.nutrition_targets import NutritionTargets
        nt_res = await db.execute(
            select(NutritionTargets).where(NutritionTargets.user_id == current_user.id)
        )
        nt = nt_res.scalar_one_or_none()
        if nt and nt.daily_calorie_target:
            calorie_target = nt.daily_calorie_target
    except Exception as e:
        logger.warning("NutritionTargets lookup failed for user %s: %s", current_user.id, e)
    if calorie_target is None:
        calorie_target = current_user.daily_calorie_target

    today_nutrition = {
        "calories_consumed": int(nutr.calories_consumed) if nutr else None,
        "calories_target": calorie_target,
        "protein_consumed_g": nutr.protein_consumed_g if nutr else None,
        "carbs_consumed_g": nutr.carbs_consumed_g if nutr else None,
        "fat_consumed_g": nutr.fat_consumed_g if nutr else None,
    }

    return {
        "current_readiness": current_readiness,
        "today_diagnosis": today_diagnosis,
        "last_session": last_session,
        "recent_sessions": recent_sessions,
        "weekly_recap": weekly_recap,
        "today_nutrition": today_nutrition,
    }


@router.get("/search")
async def search_posts(
    q: str = Query(..., min_length=1),
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_
    results_res = await db.execute(
        select(SocialPost)
        .where(
            SocialPost.is_deleted == False,
            SocialPost.caption.ilike(f"%{q}%"),
            SocialPost.user_id.in_(active_user_ids_subquery()),
        )
        .order_by(SocialPost.created_at.desc())
        .offset(page * limit)
        .limit(limit + 1)
    )
    posts = results_res.scalars().all()
    has_more = len(posts) > limit
    posts = posts[:limit]
    built = await _build_posts(list(posts), str(current_user.id), db)
    return {"posts": built, "page": page, "has_more": has_more, "query": q}


@router.get("/{post_id}")
async def get_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return single post detail. 404 if not found or soft-deleted."""
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = res.scalar_one_or_none()
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="Post not found")
    # Hide posts whose author is soft-deleted (except from the author themselves)
    if str(post.user_id) != str(current_user.id):
        author_res = await db.execute(select(User).where(User.id == post.user_id))
        author = author_res.scalar_one_or_none()
        if not author or author.delete_requested_at is not None:
            raise HTTPException(status_code=404, detail="Post not found")
    built = await _build_post(post, str(current_user.id), db)
    return {"post": built}


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = res.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your post")

    # Soft delete the post
    post.is_deleted = True

    # If a story is linked, hard-delete it
    if post.story_id:
        from app.models.story import Story
        story_res = await db.execute(select(Story).where(Story.id == post.story_id))
        linked_story = story_res.scalar_one_or_none()
        if linked_story:
            await db.delete(linked_story)

    await db.flush()
    return {"message": "deleted"}


@router.patch("/{post_id}")
async def patch_post(
    post_id: str,
    body: PostPatchIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update caption, is_pinned, or is_archived."""
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = res.scalar_one_or_none()
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your post")
    if body.caption is not None:
        post.caption = body.caption
    if body.is_pinned is not None:
        post.is_pinned = body.is_pinned
    if body.is_archived is not None:
        post.is_archived = body.is_archived
    await db.flush()
    built = await _build_post(post, str(current_user.id), db)
    return {"post": built}


@router.post("/{post_id}/react")
async def toggle_reaction(
    post_id: str,
    reaction_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if reaction_type not in ("fire", "muscle", "heart"):
        raise HTTPException(status_code=400, detail="Invalid reaction type")
    res = await db.execute(
        select(SocialReaction).where(
            SocialReaction.post_id == post_id,
            SocialReaction.user_id == current_user.id,
            SocialReaction.reaction_type == reaction_type,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        user_reacted = False
    else:
        r = SocialReaction(post_id=post_id, user_id=current_user.id, reaction_type=reaction_type)
        db.add(r)
        user_reacted = True
    await db.flush()
    count_res = await db.execute(
        select(func.count(SocialReaction.id)).where(
            SocialReaction.post_id == post_id,
            SocialReaction.reaction_type == reaction_type,
        )
    )
    count = int(count_res.scalar() or 0)
    return {"reaction_type": reaction_type, "count": count, "user_reacted": user_reacted}


@router.post("/{post_id}/like")
async def like_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = pg_insert(PostLike).values(
        id=uuid_module.uuid4(),
        post_id=uuid_module.UUID(post_id),
        user_id=current_user.id,
    ).on_conflict_do_nothing(constraint="uq_post_like")
    await db.execute(stmt)
    await db.flush()
    like_count_res = await db.execute(
        select(func.count(PostLike.id)).where(PostLike.post_id == uuid_module.UUID(post_id))
    )
    like_count = int(like_count_res.scalar() or 0)
    return {"liked": True, "like_count": like_count}


@router.delete("/{post_id}/like")
async def unlike_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(PostLike).where(
            PostLike.post_id == uuid_module.UUID(post_id),
            PostLike.user_id == current_user.id,
        )
    )
    like = res.scalar_one_or_none()
    if like:
        await db.delete(like)
        await db.flush()
    like_count_res = await db.execute(
        select(func.count(PostLike.id)).where(PostLike.post_id == uuid_module.UUID(post_id))
    )
    like_count = int(like_count_res.scalar() or 0)
    return {"liked": False, "like_count": like_count}


@router.get("/{post_id}/comments")
async def get_comments(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get all comments for this post ordered oldest first
    all_res = await db.execute(
        select(SocialComment)
        .where(
            SocialComment.post_id == post_id,
            SocialComment.user_id.in_(active_user_ids_subquery()),
        )
        .order_by(SocialComment.created_at.asc())
    )
    all_comments = all_res.scalars().all()

    async def build_comment(c: SocialComment) -> dict:
        author_res = await db.execute(select(User).where(User.id == c.user_id))
        author = author_res.scalar_one_or_none()
        return {
            "id": str(c.id),
            "user_id": str(c.user_id),
            "display_name": (author.display_name or author.username or "Athlete") if author else "Athlete",
            "avatar_url": getattr(author, "avatar_url", None) if author else None,
            "initials": _user_initials(author) if author else "?",
            "comment_text": c.comment_text,
            "created_at": c.created_at.isoformat(),
            "time_ago": _time_ago(c.created_at),
            "is_own": str(c.user_id) == str(current_user.id),
            "parent_comment_id": str(c.parent_comment_id) if getattr(c, 'parent_comment_id', None) else None,
            "like_count": getattr(c, 'like_count', 0) or 0,
            "is_liked_by_me": False,
            "replies": [],
            "total_reply_count": 0,
        }

    # Organize: top-level first, then nest replies
    comment_map: dict = {}
    top_level = []
    for c in all_comments:
        built = await build_comment(c)
        comment_map[str(c.id)] = built
        parent_id = getattr(c, 'parent_comment_id', None)
        if parent_id is None:
            top_level.append(built)

    # Attach replies to parents
    for c in all_comments:
        parent_id = getattr(c, 'parent_comment_id', None)
        if parent_id and str(parent_id) in comment_map:
            parent = comment_map[str(parent_id)]
            reply = comment_map[str(c.id)]
            parent["replies"].append(reply)
            parent["total_reply_count"] += 1

    # Reverse top-level to newest first
    top_level.reverse()
    return {"comments": top_level, "total": len(top_level)}


@router.post("/{post_id}/comments")
async def add_comment(
    post_id: str,
    body: CommentIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    text = body.comment_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(text) > 300:
        raise HTTPException(status_code=400, detail="Comment too long (max 300 chars)")
    parent_id = None
    if body.parent_comment_id:
        try:
            parent_id = uuid_module.UUID(body.parent_comment_id)
        except ValueError:
            pass
    c = SocialComment(
        post_id=uuid_module.UUID(post_id),
        user_id=current_user.id,
        comment_text=text,
        parent_comment_id=parent_id,
    )
    db.add(c)
    await db.flush()
    return {
        "comment": {
            "id": str(c.id),
            "user_id": str(c.user_id),
            "display_name": current_user.display_name or current_user.username or "Athlete",
            "avatar_url": getattr(current_user, "avatar_url", None),
            "initials": _user_initials(current_user),
            "comment_text": c.comment_text,
            "created_at": c.created_at.isoformat(),
            "time_ago": "just now",
            "is_own": True,
            "parent_comment_id": str(parent_id) if parent_id else None,
            "like_count": 0,
            "is_liked_by_me": False,
            "replies": [],
            "total_reply_count": 0,
        }
    }


@router.delete("/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialComment).where(SocialComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment or str(comment.post_id) != post_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(comment.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your comment")
    await db.delete(comment)
    await db.flush()
    return {"message": "deleted"}


@router.patch("/{post_id}/comments/{comment_id}")
async def edit_comment(
    post_id: str,
    comment_id: str,
    body: CommentPatchIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialComment).where(SocialComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment or str(comment.post_id) != post_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(comment.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your comment")
    comment.comment_text = body.comment_text.strip()
    await db.flush()
    return {"comment": {"id": str(comment.id), "comment_text": comment.comment_text}}


@router.post("/{post_id}/comments/{comment_id}/like")
async def like_comment(
    post_id: str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(SocialComment).where(SocialComment.id == comment_id))
    comment = res.scalar_one_or_none()
    if not comment or str(comment.post_id) != post_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    existing_res = await db.execute(
        select(CommentLike).where(
            CommentLike.comment_id == uuid_module.UUID(comment_id),
            CommentLike.user_id == current_user.id,
        )
    )
    existing = existing_res.scalar_one_or_none()
    liked: bool
    if existing:
        await db.delete(existing)
        liked = False
    else:
        db.add(CommentLike(
            id=uuid_module.uuid4(),
            comment_id=uuid_module.UUID(comment_id),
            user_id=current_user.id,
        ))
        liked = True
    await db.flush()
    count_res = await db.execute(
        select(func.count(CommentLike.id)).where(CommentLike.comment_id == uuid_module.UUID(comment_id))
    )
    like_count = int(count_res.scalar() or 0)
    comment.like_count = like_count
    await db.flush()
    return {"liked": liked, "like_count": like_count}


@router.post("/{post_id}/save")
async def save_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(SavedPost).where(SavedPost.user_id == current_user.id, SavedPost.post_id == post_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already saved")
    db.add(SavedPost(user_id=current_user.id, post_id=post_id))
    await db.flush()
    return {"saved": True}


@router.delete("/{post_id}/save")
async def unsave_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(SavedPost).where(SavedPost.user_id == current_user.id, SavedPost.post_id == post_id)
    )
    saved = res.scalar_one_or_none()
    if saved:
        await db.delete(saved)
        await db.flush()
    return {"saved": False}


@router.post("/{post_id}/hide")
async def hide_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(HiddenPost).where(HiddenPost.user_id == current_user.id, HiddenPost.post_id == post_id)
    )
    if not existing.scalar_one_or_none():
        db.add(HiddenPost(user_id=current_user.id, post_id=post_id))
        await db.flush()
    return {"hidden": True}


@router.get("/{post_id}/insights")
async def get_post_insights(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    res = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = res.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your post")

    # Views
    views_res = await db.execute(
        select(func.count(PostView.id)).where(PostView.post_id == post_id)
    )
    total_views = int(views_res.scalar() or 0)

    # Reactions
    reactions_res = await db.execute(
        select(SocialReaction.reaction_type, func.count(SocialReaction.id))
        .where(SocialReaction.post_id == post_id)
        .group_by(SocialReaction.reaction_type)
    )
    reaction_counts = {r: c for r, c in reactions_res.all()}
    fire_count = reaction_counts.get("fire", 0)
    muscle_count = reaction_counts.get("muscle", 0)
    heart_count = reaction_counts.get("heart", 0)

    # Comments
    comments_res = await db.execute(
        select(func.count(SocialComment.id)).where(SocialComment.post_id == post_id)
    )
    total_comments = int(comments_res.scalar() or 0)

    # Saves
    saves_res = await db.execute(
        select(func.count(SavedPost.id)).where(SavedPost.post_id == post_id)
    )
    total_saves = int(saves_res.scalar() or 0)

    return {
        "total_views": total_views,
        "fire_count": fire_count,
        "muscle_count": muscle_count,
        "heart_count": heart_count,
        "total_reactions": fire_count + muscle_count + heart_count,
        "total_comments": total_comments,
        "total_saves": total_saves,
    }


@router.post("/{post_id}/report")
async def report_post(
    post_id: str,
    body: PostReportIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.post_report import PostReport
    import uuid as _uuid
    try:
        post_uuid = _uuid.UUID(post_id)
    except (ValueError, TypeError):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid post_id")
    report = PostReport(
        reporter_user_id=current_user.id,
        reported_post_id=post_uuid,
        reason=body.reason,
    )
    db.add(report)
    await db.flush()
    return {"message": "reported"}
