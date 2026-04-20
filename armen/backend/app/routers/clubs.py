import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.club import Club
from app.models.club_membership import ClubMembership
from app.models.user_activity import UserActivity
from app.routers.auth import get_current_user
from app.services.user_visibility import active_user_ids_subquery, active_user_filter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clubs", tags=["clubs"])

_DEFAULT_CLUBS = [
    {"name": "MMA and Combat Sports", "sport_type": "mma", "cover_image": "workout", "description": "Fighters, grapplers, and martial artists"},
    {"name": "Running and Cardio", "sport_type": "running", "cover_image": "activity", "description": "Runners, joggers, and cardio enthusiasts"},
    {"name": "Gym and Strength", "sport_type": "gym", "cover_image": "workout", "description": "Lifters, bodybuilders, and strength athletes"},
    {"name": "Cycling", "sport_type": "cycling", "cover_image": "activity", "description": "Road cyclists, mountain bikers, and spinners"},
    {"name": "Swimming", "sport_type": "swimming", "cover_image": "recovery_high", "description": "Pool and open water swimmers"},
    {"name": "Football and Soccer", "sport_type": "football", "cover_image": "streak", "description": "Football and soccer players"},
    {"name": "Basketball", "sport_type": "basketball", "cover_image": "streak", "description": "Basketball players of all levels"},
    {"name": "General Fitness", "sport_type": "general", "cover_image": "wellness", "description": "All fitness goals welcome"},
]

_SPORT_TAG_MAP: dict[str, str] = {
    "mma": "mma", "boxing": "mma", "bjj": "mma", "wrestling": "mma", "muay thai": "mma",
    "running": "running", "cardio": "running", "jogging": "running",
    "gym": "gym", "weightlifting": "gym", "bodybuilding": "gym", "powerlifting": "gym", "crossfit": "gym",
    "cycling": "cycling", "bike": "cycling",
    "swimming": "swimming",
    "football": "football", "soccer": "football",
    "basketball": "basketball",
}


async def seed_default_clubs(db: AsyncSession):
    """Called at startup to ensure default clubs exist."""
    for club_data in _DEFAULT_CLUBS:
        existing = await db.execute(select(Club).where(Club.name == club_data["name"]))
        if existing.scalar_one_or_none() is None:
            club = Club(**club_data)
            db.add(club)
    await db.flush()


def _get_week_start() -> datetime:
    today = datetime.utcnow().date()
    monday = today - timedelta(days=today.weekday())
    return datetime.combine(monday, datetime.min.time())


def _format_countdown(week_start: datetime) -> str:
    next_reset = week_start + timedelta(days=7)
    diff = next_reset - datetime.utcnow()
    days = diff.days
    hours = diff.seconds // 3600
    return f"{days}d {hours}h"


async def _club_dict(club: Club, user_id, db: AsyncSession) -> dict:
    member_res = await db.execute(
        select(func.count(ClubMembership.id)).where(
            ClubMembership.club_id == club.id,
            ClubMembership.user_id.in_(active_user_ids_subquery()),
        )
    )
    actual_count = int(member_res.scalar() or 0)
    is_member_res = await db.execute(
        select(ClubMembership).where(ClubMembership.club_id == club.id, ClubMembership.user_id == user_id)
    )
    is_member = is_member_res.scalar_one_or_none() is not None
    return {
        "id": str(club.id),
        "name": club.name,
        "sport_type": club.sport_type,
        "cover_image": club.cover_image,
        "description": club.description,
        "member_count": actual_count,
        "is_member": is_member,
    }


@router.get("")
async def list_clubs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Club).order_by(Club.name))
    clubs = res.scalars().all()
    out = []
    for c in clubs:
        out.append(await _club_dict(c, current_user.id, db))
    return {"clubs": out}


@router.get("/mine")
async def my_clubs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mem_res = await db.execute(
        select(ClubMembership.club_id).where(ClubMembership.user_id == current_user.id)
    )
    club_ids = [r for r in mem_res.scalars().all()]
    if not club_ids:
        return {"clubs": []}
    res = await db.execute(select(Club).where(Club.id.in_(club_ids)).order_by(Club.name))
    clubs = res.scalars().all()
    out = []
    for c in clubs:
        out.append(await _club_dict(c, current_user.id, db))
    return {"clubs": out}


@router.get("/{club_id}")
async def get_club(
    club_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Club).where(Club.id == club_id))
    club = res.scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    club_data = await _club_dict(club, current_user.id, db)

    # Members
    mem_res = await db.execute(
        select(ClubMembership.user_id).where(
            ClubMembership.club_id == club_id,
            ClubMembership.user_id.in_(active_user_ids_subquery()),
        )
    )
    member_ids = [r for r in mem_res.scalars().all()]
    members_out = []
    if member_ids:
        users_res = await db.execute(
            select(User).where(User.id.in_(member_ids), active_user_filter()).limit(50)
        )
        for u in users_res.scalars().all():
            name = u.display_name or u.username or "Athlete"
            parts = name.split()
            initials = (parts[0][0].upper() + (parts[-1][0].upper() if len(parts) > 1 else "")) if parts else "?"
            members_out.append({
                "id": str(u.id),
                "display_name": name,
                "username": u.username or "",
                "sport_tags": u.sport_tags or [],
                "initials": initials,
                "avatar_url": getattr(u, "avatar_url", None),
            })

    return {"club": club_data, "members": members_out}


@router.post("/{club_id}/join")
async def join_club(
    club_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Club).where(Club.id == club_id))
    club = res.scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    existing = await db.execute(
        select(ClubMembership).where(ClubMembership.club_id == club_id, ClubMembership.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        return {"message": "already a member"}
    membership = ClubMembership(club_id=club_id, user_id=current_user.id)
    db.add(membership)
    await db.flush()
    return {"message": "joined"}


@router.delete("/{club_id}/leave")
async def leave_club(
    club_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ClubMembership).where(ClubMembership.club_id == club_id, ClubMembership.user_id == current_user.id)
    )
    membership = res.scalar_one_or_none()
    if not membership:
        return {"message": "not a member"}
    await db.delete(membership)
    await db.flush()
    return {"message": "left"}


@router.get("/{club_id}/leaderboard")
async def get_club_leaderboard(
    club_id: str,
    metric: str = Query(default="training_load"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Club).where(Club.id == club_id))
    club = res.scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    mem_res = await db.execute(
        select(ClubMembership.user_id).where(
            ClubMembership.club_id == club_id,
            ClubMembership.user_id.in_(active_user_ids_subquery()),
        )
    )
    member_ids = [r for r in mem_res.scalars().all()]
    if not member_ids:
        return {"leaderboard": [], "week_start": _get_week_start().date().isoformat(), "countdown": _format_countdown(_get_week_start()), "last_week_top3": []}

    week_start = _get_week_start()

    # Compute scores for this week
    scores: dict[str, float] = {}
    if metric in ("training_load", "sessions"):
        acts_res = await db.execute(
            select(UserActivity).where(
                UserActivity.user_id.in_(member_ids),
                UserActivity.logged_at >= week_start,
                UserActivity.is_rest_day == False,
            )
        )
        acts = acts_res.scalars().all()
        for a in acts:
            uid = str(a.user_id)
            if metric == "training_load":
                scores[uid] = scores.get(uid, 0) + (a.training_load or 0)
            else:
                scores[uid] = scores.get(uid, 0) + 1
    elif metric == "steps":
        from app.models.daily_steps import DailySteps
        week_start_date_str = week_start.date().isoformat()
        steps_res = await db.execute(
            select(DailySteps).where(
                DailySteps.user_id.in_(member_ids),
                DailySteps.date >= week_start_date_str,
            )
        )
        for s in steps_res.scalars().all():
            uid = str(s.user_id)
            scores[uid] = scores.get(uid, 0) + (s.steps or 0)

    # Rank all members
    ranked = sorted(member_ids, key=lambda uid: -scores.get(str(uid), 0))
    users_res = await db.execute(select(User).where(User.id.in_(member_ids)))
    user_map = {str(u.id): u for u in users_res.scalars().all()}

    leaderboard = []
    my_rank = None
    for i, uid in enumerate(ranked):
        u = user_map.get(str(uid))
        if not u:
            continue
        name = u.display_name or u.username or "Athlete"
        parts = name.split()
        initials = (parts[0][0].upper() + (parts[-1][0].upper() if len(parts) > 1 else "")) if parts else "?"
        row = {
            "rank": i + 1,
            "user_id": str(uid),
            "display_name": name,
            "initials": initials,
            "avatar_url": getattr(u, "avatar_url", None),
            "sport_tags": u.sport_tags or [],
            "value": scores.get(str(uid), 0),
            "is_current_user": str(uid) == str(current_user.id),
        }
        leaderboard.append(row)
        if str(uid) == str(current_user.id):
            my_rank = i + 1

    # Last week top 3
    last_week_start = week_start - timedelta(days=7)
    last_week_end = week_start
    last_scores: dict[str, float] = {}
    if metric in ("training_load", "sessions"):
        lw_res = await db.execute(
            select(UserActivity).where(
                UserActivity.user_id.in_(member_ids),
                UserActivity.logged_at >= last_week_start,
                UserActivity.logged_at < last_week_end,
                UserActivity.is_rest_day == False,
            )
        )
        for a in lw_res.scalars().all():
            uid = str(a.user_id)
            if metric == "training_load":
                last_scores[uid] = last_scores.get(uid, 0) + (a.training_load or 0)
            else:
                last_scores[uid] = last_scores.get(uid, 0) + 1

    last_ranked = sorted(member_ids, key=lambda uid: -last_scores.get(str(uid), 0))[:3]
    last_week_top3 = []
    for i, uid in enumerate(last_ranked):
        u = user_map.get(str(uid))
        if u:
            last_week_top3.append({
                "rank": i + 1,
                "display_name": u.display_name or u.username or "Athlete",
                "value": last_scores.get(str(uid), 0),
            })

    return {
        "leaderboard": leaderboard[:10],
        "my_rank": my_rank,
        "my_entry": next((r for r in leaderboard if r["is_current_user"]), None),
        "week_start": week_start.date().isoformat(),
        "countdown": _format_countdown(week_start),
        "metric": metric,
        "last_week_top3": last_week_top3,
    }


@router.post("/auto-join")
async def auto_join_clubs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-join clubs based on the user's sport_tags."""
    sport_tags = current_user.sport_tags or []
    joined = []
    for tag in sport_tags:
        club_type = _SPORT_TAG_MAP.get(tag.lower())
        if not club_type:
            club_type = "general"
        club_res = await db.execute(select(Club).where(Club.sport_type == club_type))
        club = club_res.scalar_one_or_none()
        if club:
            existing = await db.execute(
                select(ClubMembership).where(ClubMembership.club_id == club.id, ClubMembership.user_id == current_user.id)
            )
            if not existing.scalar_one_or_none():
                db.add(ClubMembership(club_id=club.id, user_id=current_user.id))
                joined.append(club.name)
    # Always join General Fitness
    gen_res = await db.execute(select(Club).where(Club.sport_type == "general"))
    gen = gen_res.scalar_one_or_none()
    if gen:
        ex = await db.execute(
            select(ClubMembership).where(ClubMembership.club_id == gen.id, ClubMembership.user_id == current_user.id)
        )
        if not ex.scalar_one_or_none():
            db.add(ClubMembership(club_id=gen.id, user_id=current_user.id))
            joined.append(gen.name)
    await db.flush()
    return {"joined": joined}
