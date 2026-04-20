"""
Highlights — user-curated reels of past stories, scoped to a date range and
overlaid with one auto-computed training stat.

Endpoints:
  GET  /users/{user_id}/highlights      list highlights (ordered by position)
  POST /highlights                      create
  PATCH /highlights/{id}                update (title / cover / featured_stat / story_ids / position)
  DELETE /highlights/{id}               soft-delete
  POST /highlights/reorder              body: [{id, position}, ...]
  GET  /highlights/{id}/stories         stories in the highlight (full dicts)
  GET  /highlights/{id}/stats           auto-computed stats for the date range
"""

import logging
import uuid as uuid_module
from datetime import datetime, date, time
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.highlight import Highlight
from app.models.story import Story
from app.models.user_activity import UserActivity
from app.models.activity import Activity
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["highlights"])


# ── Schemas ──────────────────────────────────────────────────────────────────


FEATURED_STATS = {"sessions", "load", "prs", "readiness"}


class HighlightIn(BaseModel):
    title: str = Field(..., max_length=60)
    start_date: date
    end_date: date
    story_ids: List[str] = Field(default_factory=list)
    cover_photo_url: Optional[str] = None
    featured_stat: str = "sessions"


class HighlightPatch(BaseModel):
    title: Optional[str] = Field(None, max_length=60)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    story_ids: Optional[List[str]] = None
    cover_photo_url: Optional[str] = None
    featured_stat: Optional[str] = None
    position: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    position: int


class ReorderIn(BaseModel):
    items: List[ReorderItem]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _serialise(h: Highlight, stat_value: Optional[float] = None) -> dict:
    return {
        "id": str(h.id),
        "user_id": str(h.user_id),
        "title": h.title,
        "cover_photo_url": h.cover_photo_url,
        "start_date": h.start_date.isoformat() if h.start_date else None,
        "end_date": h.end_date.isoformat() if h.end_date else None,
        "featured_stat": h.featured_stat,
        "story_ids": h.story_ids or [],
        "position": h.position,
        "stat_value": stat_value,
        "created_at": h.created_at.isoformat(),
        "updated_at": h.updated_at.isoformat(),
    }


async def _load_highlight(db: AsyncSession, highlight_id: str) -> Highlight:
    try:
        hid = uuid_module.UUID(highlight_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid highlight id")
    res = await db.execute(
        select(Highlight).where(
            Highlight.id == hid,
            Highlight.deleted_at.is_(None),
        )
    )
    h = res.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    return h


async def _auto_cover(db: AsyncSession, story_ids: List[str]) -> Optional[str]:
    """If no cover is set, use the photo_url of the first listed story."""
    if not story_ids:
        return None
    try:
        first_id = uuid_module.UUID(story_ids[0])
    except ValueError:
        return None
    res = await db.execute(select(Story.photo_url).where(Story.id == first_id))
    return res.scalar_one_or_none()


async def _compute_stats(
    db: AsyncSession,
    user_id,
    start: date,
    end: date,
) -> dict:
    """Aggregate training signals for a highlight's date range."""
    start_dt = datetime.combine(start, time.min)
    # end is inclusive → include all of end_date
    end_dt = datetime.combine(end, time.max)

    # Sessions (manual + strava activities fall under UserActivity / Activity)
    manual = await db.execute(
        select(UserActivity).where(
            UserActivity.user_id == user_id,
            UserActivity.logged_at >= start_dt,
            UserActivity.logged_at <= end_dt,
        )
    )
    manual_rows = manual.scalars().all()

    strava = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.start_date >= start_dt,
            Activity.start_date <= end_dt,
        )
    )
    strava_rows = strava.scalars().all()

    sessions = len(manual_rows) + len(strava_rows)

    total_load = 0.0
    for r in manual_rows:
        if getattr(r, "training_load", None):
            total_load += float(r.training_load)
    for r in strava_rows:
        if getattr(r, "training_load", None):
            total_load += float(r.training_load)

    # Readiness avg — placeholder until proper readiness aggregation lands.
    # (The current readiness model is cache-keyed, not a time series.)
    avg_readiness: Optional[float] = None

    # PRs — conservative placeholder until per-exercise PR tracking lands.
    prs = 0

    return {
        "sessions": sessions,
        "load": round(total_load, 1),
        "prs": prs,
        "readiness": round(avg_readiness, 1) if avg_readiness is not None else None,
    }


def _stat_value(stats: dict, featured_stat: str) -> Optional[float]:
    if featured_stat not in FEATURED_STATS:
        return None
    v = stats.get(featured_stat)
    return v


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/users/{user_id}/highlights")
async def list_highlights(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = uuid_module.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")

    res = await db.execute(
        select(Highlight)
        .where(Highlight.user_id == uid, Highlight.deleted_at.is_(None))
        .order_by(Highlight.position.asc(), Highlight.created_at.asc())
    )
    items = res.scalars().all()

    out = []
    for h in items:
        stats = await _compute_stats(db, uid, h.start_date, h.end_date)
        out.append(_serialise(h, _stat_value(stats, h.featured_stat)))
    return {"highlights": out}


@router.post("/highlights")
async def create_highlight(
    body: HighlightIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.featured_stat not in FEATURED_STATS:
        raise HTTPException(status_code=400, detail="Invalid featured_stat")
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    # Pick a default position at the end of the user's list
    pos_res = await db.execute(
        select(Highlight.position)
        .where(Highlight.user_id == current_user.id, Highlight.deleted_at.is_(None))
        .order_by(Highlight.position.desc())
        .limit(1)
    )
    top = pos_res.scalar_one_or_none()
    next_position = (top + 1) if isinstance(top, int) else 0

    cover = body.cover_photo_url or await _auto_cover(db, body.story_ids)

    h = Highlight(
        user_id=current_user.id,
        title=body.title,
        cover_photo_url=cover,
        start_date=body.start_date,
        end_date=body.end_date,
        featured_stat=body.featured_stat,
        story_ids=body.story_ids,
        position=next_position,
    )
    db.add(h)
    await db.flush()

    stats = await _compute_stats(db, current_user.id, h.start_date, h.end_date)
    return {"highlight": _serialise(h, _stat_value(stats, h.featured_stat))}


@router.patch("/highlights/{highlight_id}")
async def update_highlight(
    highlight_id: str,
    body: HighlightPatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await _load_highlight(db, highlight_id)
    if h.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your highlight")

    if body.featured_stat is not None:
        if body.featured_stat not in FEATURED_STATS:
            raise HTTPException(status_code=400, detail="Invalid featured_stat")
        h.featured_stat = body.featured_stat
    if body.title is not None:
        h.title = body.title
    if body.start_date is not None:
        h.start_date = body.start_date
    if body.end_date is not None:
        h.end_date = body.end_date
    if body.story_ids is not None:
        h.story_ids = body.story_ids
        # Re-derive cover if the current one isn't from any of the new stories
        if not h.cover_photo_url and body.story_ids:
            h.cover_photo_url = await _auto_cover(db, body.story_ids)
    if body.cover_photo_url is not None:
        h.cover_photo_url = body.cover_photo_url
    if body.position is not None:
        h.position = body.position

    if h.end_date < h.start_date:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")

    h.updated_at = datetime.utcnow()
    await db.flush()

    stats = await _compute_stats(db, h.user_id, h.start_date, h.end_date)
    return {"highlight": _serialise(h, _stat_value(stats, h.featured_stat))}


@router.delete("/highlights/{highlight_id}")
async def delete_highlight(
    highlight_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await _load_highlight(db, highlight_id)
    if h.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your highlight")
    h.deleted_at = datetime.utcnow()
    await db.flush()
    return {"ok": True}


@router.post("/highlights/reorder")
async def reorder_highlights(
    body: ReorderIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership of every id in one query
    ids = []
    for item in body.items:
        try:
            ids.append(uuid_module.UUID(item.id))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid id {item.id}")

    res = await db.execute(
        select(Highlight).where(
            Highlight.id.in_(ids),
            Highlight.user_id == current_user.id,
            Highlight.deleted_at.is_(None),
        )
    )
    owned = {h.id: h for h in res.scalars().all()}
    if len(owned) != len(ids):
        raise HTTPException(status_code=403, detail="One or more highlights not owned by user")

    for item in body.items:
        hid = uuid_module.UUID(item.id)
        h = owned[hid]
        h.position = item.position
        h.updated_at = datetime.utcnow()

    await db.flush()
    return {"ok": True}


@router.get("/highlights/{highlight_id}/stories")
async def get_highlight_stories(
    highlight_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await _load_highlight(db, highlight_id)

    # Ownership isn't required — highlights are public to anyone viewing the
    # user's profile. Privacy work lands in Phase E.

    out = []
    if h.story_ids:
        # Load each story while preserving the order supplied by story_ids
        ids = []
        for sid in h.story_ids:
            try:
                ids.append(uuid_module.UUID(sid))
            except ValueError:
                continue
        if ids:
            res = await db.execute(select(Story).where(Story.id.in_(ids)))
            by_id = {s.id: s for s in res.scalars().all()}
            for sid in ids:
                s = by_id.get(sid)
                if not s:
                    continue
                out.append({
                    "id": str(s.id),
                    "user_id": str(s.user_id),
                    "photo_url": s.photo_url,
                    "caption": s.caption,
                    "oryx_data_overlay_json": s.oryx_data_overlay_json,
                    "text_overlay": s.text_overlay,
                    "created_at": s.created_at.isoformat(),
                })
    return {"highlight_id": str(h.id), "stories": out}


@router.get("/highlights/{highlight_id}/stats")
async def get_highlight_stats(
    highlight_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    h = await _load_highlight(db, highlight_id)
    stats = await _compute_stats(db, h.user_id, h.start_date, h.end_date)
    return {"highlight_id": str(h.id), "featured_stat": h.featured_stat, **stats}
