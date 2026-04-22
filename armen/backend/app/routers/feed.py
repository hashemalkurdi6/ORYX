import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.social_post import SocialPost
from app.models.social_follow import SocialFollow
from app.routers.auth import get_current_user
from app.routers.posts import _build_posts
from app.services.user_visibility import active_user_ids_subquery

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("")
async def get_feed(
    page: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    filter: str = Query(default="all"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return chronological feed of posts from followed users + own posts."""
    from app.models.hidden_post import HiddenPost
    from app.models.post_view import PostView
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy import func as sa_func

    following_res = await db.execute(
        select(SocialFollow.following_id).where(SocialFollow.follower_id == current_user.id)
    )
    following_ids = [r for r in following_res.scalars().all()]
    feed_user_ids = following_ids + [current_user.id]

    # Get hidden post IDs for this user
    hidden_res = await db.execute(
        select(HiddenPost.post_id).where(HiddenPost.user_id == current_user.id)
    )
    hidden_ids = [r for r in hidden_res.scalars().all()]

    # Base query — clubs filter bypasses the feed_user_ids restriction
    if filter == "clubs":
        query = select(SocialPost).where(
            SocialPost.is_deleted == False,
            SocialPost.club_id.isnot(None),
            SocialPost.user_id.in_(active_user_ids_subquery()),
        )
    else:
        query = select(SocialPost).where(
            SocialPost.user_id.in_(feed_user_ids),
            SocialPost.is_deleted == False,
            SocialPost.user_id.in_(active_user_ids_subquery()),
        )

    # Apply filter-specific conditions
    if filter == "following":
        query = query.where(SocialPost.user_id != current_user.id)
    elif filter == "workouts":
        query = query.where(
            sa_func.jsonb_extract_path_text(SocialPost.oryx_data_card_json, 'post_type') == 'workout'
        )
    elif filter == "insights":
        query = query.where(
            sa_func.jsonb_extract_path_text(SocialPost.oryx_data_card_json, 'post_type') == 'daily_insight'
        )
    elif filter == "recaps":
        query = query.where(
            sa_func.jsonb_extract_path_text(SocialPost.oryx_data_card_json, 'post_type') == 'weekly_recap'
        )

    if hidden_ids:
        query = query.where(SocialPost.id.not_in(hidden_ids))

    query = query.order_by(SocialPost.created_at.desc()).offset(page * limit).limit(limit + 1)

    posts_res = await db.execute(query)
    posts = posts_res.scalars().all()
    has_more = len(posts) > limit
    posts = posts[:limit]

    built = await _build_posts(list(posts), str(current_user.id), db)
    # Record views (upsert — ignore conflicts). View-tracking failure must
    # never break the feed load, so we swallow but log at warning so real
    # DB issues surface in ops.
    for p in posts:
        try:
            stmt = pg_insert(PostView).values(
                id=__import__('uuid').uuid4(),
                post_id=p.id,
                viewer_user_id=current_user.id,
                viewed_at=__import__('datetime').datetime.utcnow(),
            ).on_conflict_do_nothing(constraint="uq_post_view")
            await db.execute(stmt)
        except Exception as e:
            logger.warning("post_view insert failed post=%s user=%s: %s", p.id, current_user.id, e)

    return {
        "posts": built,
        "page": page,
        "has_more": has_more,
        "following_count": len(following_ids),
        "filter": filter,
    }
