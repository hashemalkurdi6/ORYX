import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from openai import AsyncOpenAI
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models.daily_steps import DailySteps
from app.models.diagnosis import Diagnosis
from app.models.health_data import HealthSnapshot
from app.models.nutrition import NutritionLog
from app.models.user import User
from app.models.user_activity import UserActivity
from app.models.wellness import WellnessCheckin
from app.models.weight_log import WeightLog
from app.routers.auth import get_current_user
from app.services.readiness_service import calculate_readiness

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/home", tags=["home"])


# Run a read-only query in its own AsyncSession so multiple independent
# queries can run concurrently via asyncio.gather — a single AsyncSession
# doesn't support concurrent execute() calls.
async def _run_query(query, *, mode: str = "result"):
    async with AsyncSessionLocal() as s:
        res = await s.execute(query)
        if mode == "scalar":
            return res.scalar()
        if mode == "scalar_one_or_none":
            return res.scalar_one_or_none()
        if mode == "scalars_all":
            return res.scalars().all()
        if mode == "first":
            return res.first()
        return list(res)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_weekly_training_days(weekly_training_days: str | None) -> int | None:
    if not weekly_training_days:
        return None
    nums = re.findall(r"\d+", weekly_training_days)
    return int(nums[0]) if nums else None


def _build_diagnosis_prompt(data: dict) -> str:
    lines: list[str] = []
    lines.append(f"Athlete: {data['display_name']}")
    if data.get("primary_goal"):
        lines.append(f"Goal: {data['primary_goal']}")
    if data.get("sport_tags"):
        tags = data["sport_tags"] if isinstance(data["sport_tags"], list) else [data["sport_tags"]]
        lines.append(f"Sport: {', '.join(str(t) for t in tags)}")
    lines.append("")

    # Training section
    if data.get("sessions_this_week", 0) > 0 or data.get("last_session"):
        lines.append("TRAINING (last 7 days):")
        lines.append(f"- Sessions: {data.get('sessions_this_week', 0)}")
        if data.get("weekly_load"):
            lines.append(f"- Total training load: {data['weekly_load']}")
        if data.get("days_since_rest") is not None:
            lines.append(f"- Days since rest day: {data['days_since_rest']}")
        if data.get("last_session"):
            ls = data["last_session"]
            load_str = f", load {ls.get('training_load')}" if ls.get("training_load") else ""
            rpe_str = f", RPE {ls.get('rpe')}" if ls.get("rpe") else ""
            lines.append(f"- Last session: {ls.get('name', 'Unknown')}{load_str}{rpe_str}")
        if data.get("acwr") is not None:
            lines.append(f"- ACWR: {data['acwr']:.2f} ({data.get('acwr_status', 'unknown')})")
        lines.append("")

    # Nutrition section
    lines.append("NUTRITION (today):")
    if data.get("meals_logged_today"):
        cal = data.get("calories_today", 0)
        cal_target = data.get("calorie_target")
        if cal_target:
            diff = cal - cal_target
            diff_str = f"+{diff}" if diff > 0 else str(diff)
            lines.append(f"- Calories: {cal} of {cal_target} target ({diff_str} kcal)")
        else:
            lines.append(f"- Calories: {cal} kcal")
        if data.get("protein_today") is not None:
            pt = f" of {data['protein_target']}g target" if data.get("protein_target") else ""
            lines.append(f"- Protein: {data['protein_today']:.0f}g{pt}")
        if data.get("carbs_today") is not None:
            ct = f" of {data['carbs_target']}g target" if data.get("carbs_target") else ""
            lines.append(f"- Carbs: {data['carbs_today']:.0f}g{ct}")
        if data.get("fat_today") is not None:
            ft = f" of {data['fat_target']}g target" if data.get("fat_target") else ""
            lines.append(f"- Fat: {data['fat_today']:.0f}g{ft}")
        # Rule 1: low fuel + high load warning
        wl = data.get("weekly_load", 0) or 0
        if cal_target and cal > 0 and wl > 300 and cal < cal_target * 0.7:
            lines.append(
                "⚠️ Low fuel alert: caloric intake is below 70% of target despite "
                "high weekly training load — this will impair recovery and performance."
            )
    else:
        hour = datetime.utcnow().hour
        note = " (past noon — consider logging meals)" if hour >= 12 else ""
        lines.append(f"- Nutrition not logged today{note}")
    lines.append("")

    # Recovery section (only if data exists)
    if any(data.get(k) is not None for k in ["sleep_hours", "hrv_ms", "resting_heart_rate"]):
        lines.append("RECOVERY (last night):")
        if data.get("sleep_hours") is not None:
            lines.append(f"- Sleep: {data['sleep_hours']:.1f} hours")
        if data.get("hrv_ms") is not None:
            lines.append(f"- HRV: {data['hrv_ms']:.0f}ms")
        if data.get("resting_heart_rate") is not None:
            lines.append(f"- Resting heart rate: {data['resting_heart_rate']:.0f}bpm")
        lines.append("")

    # Manual inputs
    if any(data.get(k) is not None for k in ["energy_today", "soreness_today", "mood_today"]):
        lines.append("MANUAL INPUTS (today):")
        if data.get("energy_today") is not None:
            lines.append(f"- Energy: {data['energy_today']}/5")
        if data.get("soreness_today") is not None:
            lines.append(f"- Soreness: {data['soreness_today']}/5")
        if data.get("mood_today") is not None:
            lines.append(f"- Mood: {data['mood_today']}/5")
        lines.append("")

    # Weight section
    if data.get("current_weight_kg") is not None:
        lines.append("WEIGHT:")
        unit = data.get("weight_unit", "kg")
        factor = 2.20462 if unit == "lbs" else 1.0
        display = round(data["current_weight_kg"] * factor, 1)
        lines.append(f"- Current weight: {display} {unit}")
        if data.get("weight_trend"):
            trend = data["weight_trend"]
            change = data.get("weekly_weight_change_kg")
            change_disp = round(abs(change) * factor, 2) if change is not None else None
            direction = "losing" if trend == "losing" else ("gaining" if trend == "gaining" else "stable")
            if change_disp is not None:
                lines.append(f"- Trend: {direction} (~{change_disp} {unit}/week over last 28 days)")
            else:
                lines.append(f"- Trend: {direction}")
            align = data.get("weight_goal_alignment", "neutral")
            if align == "on_track":
                lines.append("- Weight trend is aligned with stated goal ✓")
            elif align == "off_track":
                lines.append("- ⚠️ Weight trend is not aligned with stated goal")
        lines.append("")

    lines.append(f"READINESS SCORE: {data['readiness_score']} — {data['readiness_label']}")
    lines.append(f"Primary readiness factor: {data['readiness_primary_factor']}")
    lines.append("")
    lines.append(
        "Based on ALL of this data together, explain why this athlete is performing and recovering "
        "the way they are today. Explicitly connect nutrition to training performance where relevant. "
        "Explicitly connect sleep to recovery where relevant. Explicitly connect training load to "
        "soreness and readiness where relevant. If weight trend data is present and misaligned with "
        "their goal, call that out specifically."
    )
    return "\n".join(lines)


def _strip_fences(s: str) -> str:
    """Remove all markdown code fence markers (``` and ```json) from a string."""
    s = re.sub(r"```json", "", s)
    s = re.sub(r"```", "", s)
    return s.strip()


def _parse_diagnosis_response(response_text: str) -> dict:
    text = response_text.strip()
    json_obj = None
    text_part = text

    # 1. JSON inside any code fence block: ```json?...```
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        try:
            json_obj = json.loads(fence.group(1).strip())
            text_part = (text[: fence.start()] + text[fence.end():]).strip()
        except (json.JSONDecodeError, ValueError):
            pass

    # 2. Bare JSON object at the end of the response
    if not json_obj:
        match = re.search(r"\n(\{[\s\S]*\})\s*$", text)
        if match:
            try:
                json_obj = json.loads(match.group(1))
                text_part = text[: match.start()].strip()
            except (json.JSONDecodeError, ValueError):
                pass

    # 3. Any recognisable JSON object anywhere in the text
    if not json_obj:
        for m in re.finditer(r"\{[^{}]+\}", text, re.DOTALL):
            try:
                candidate = json.loads(m.group())
                if any(k in candidate for k in ("diagnosis", "main_factors", "recommendation")):
                    json_obj = candidate
                    text_part = text[: m.start()].strip()
                    break
            except (json.JSONDecodeError, ValueError):
                continue

    # Always strip any leftover fence markers from the prose portion
    text_part = _strip_fences(text_part)

    if json_obj:
        return {
            "diagnosis_text": text_part or json_obj.get("diagnosis", _strip_fences(text)),
            "contributing_factors": (json_obj.get("main_factors") or [])[:3],
            "recommendation": json_obj.get("recommendation", ""),
            "tone": json_obj.get("tone", "cautionary"),
        }

    return {
        "diagnosis_text": text_part or _strip_fences(text),
        "contributing_factors": [],
        "recommendation": "",
        "tone": "cautionary",
    }


# ── Dashboard ──────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.user_time import capture_user_timezone
    capture_user_timezone(request, current_user)
    return await _build_dashboard(current_user, db)


async def _build_dashboard(current_user: User, db: AsyncSession) -> dict:
    """Pure dashboard-building logic without Request — so /diagnosis can call
    it in-process. The /dashboard HTTP handler above wraps this with the
    X-User-Timezone capture; internal callers skip that and inherit whatever
    timezone was last persisted on the user."""
    from app.services.user_time import user_today
    today = user_today(current_user)
    yesterday = today - timedelta(days=1)
    week_start = today - timedelta(days=today.weekday())
    last_week_start = week_start - timedelta(days=7)
    seven_days_ago = today - timedelta(days=7)
    twenty_eight_days_ago = today - timedelta(days=28)
    date_col = cast(UserActivity.logged_at, Date)

    # ── User profile ──────────────────────────────────────────────────────────
    display_name = (
        current_user.display_name
        or current_user.full_name
        or current_user.username
        or (current_user.email.split("@")[0] if current_user.email else "Athlete")
    )
    primary_goal = current_user.primary_goal
    sport_tags = current_user.sport_tags or []
    weekly_training_goal = _parse_weekly_training_days(current_user.weekly_training_days)
    # Single source of truth: nutrition_targets via nutrition_service. Lazy
    # populate on first read so any user past onboarding has a row.
    from app.services.nutrition_service import calculate_macro_targets, get_cached_targets
    cached = await get_cached_targets(current_user.id, db)
    if cached is None:
        cached = await calculate_macro_targets(current_user.id, db)
    daily_calorie_target = cached.get("daily_calorie_target") or current_user.daily_calorie_target
    if cached.get("protein_g") is not None:
        macro_targets = {
            "protein_target": round(cached["protein_g"]),
            "carbs_target": round(cached["carbs_g"]),
            "fat_target": round(cached["fat_g"]),
        }
    else:
        macro_targets = {"protein_target": None, "carbs_target": None, "fat_target": None}

    # ── Training ──────────────────────────────────────────────────────────────
    # Fan out independent reads over separate sessions so they run concurrently.
    four_week_start = week_start - timedelta(weeks=4)

    last_session_q = (
        select(UserActivity)
        .where(UserActivity.user_id == current_user.id, UserActivity.is_rest_day.is_(False))
        .order_by(UserActivity.logged_at.desc())
        .limit(1)
    )
    sw_count_q = select(func.count()).where(
        UserActivity.user_id == current_user.id,
        UserActivity.is_rest_day.is_(False),
        date_col >= week_start,
    )
    active_days_q = select(func.count(func.distinct(date_col))).where(
        UserActivity.user_id == current_user.id,
        UserActivity.is_rest_day.is_(False),
        date_col >= week_start,
    )
    tw_load_q = select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
        UserActivity.user_id == current_user.id,
        UserActivity.is_rest_day.is_(False),
        date_col >= week_start,
    )
    lw_load_q = select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
        UserActivity.user_id == current_user.id,
        UserActivity.is_rest_day.is_(False),
        date_col >= last_week_start,
        date_col < week_start,
    )
    # 4-week daily loads — bucketed client-side into weeks 0..3.
    four_week_daily_q = (
        select(
            date_col.label("d"),
            func.coalesce(func.sum(UserActivity.training_load), 0).label("load"),
        )
        .where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= four_week_start,
            date_col < week_start,
        )
        .group_by(date_col)
    )
    yday_load_q = select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
        UserActivity.user_id == current_user.id,
        UserActivity.is_rest_day.is_(False),
        date_col == yesterday,
    )

    (
        last_session,
        sessions_this_week_raw,
        active_days_raw,
        weekly_load_raw,
        last_week_load_raw,
        four_week_rows,
        yesterday_load_raw,
    ) = await asyncio.gather(
        _run_query(last_session_q, mode="scalar_one_or_none"),
        _run_query(sw_count_q, mode="scalar"),
        _run_query(active_days_q, mode="scalar"),
        _run_query(tw_load_q, mode="scalar"),
        _run_query(lw_load_q, mode="scalar"),
        _run_query(four_week_daily_q),
        _run_query(yday_load_q, mode="scalar"),
    )
    sessions_this_week = sessions_this_week_raw or 0
    active_days_this_week = int(active_days_raw or 0)
    weekly_load = int(weekly_load_raw or 0)
    last_week_load = int(last_week_load_raw or 0)
    yesterday_load = int(yesterday_load_raw or 0)

    four_week_loads = [0, 0, 0, 0]
    for row in four_week_rows:
        idx = (week_start - row.d).days // 7
        if 0 <= idx < 4:
            four_week_loads[idx] += int(row.load)
    four_week_avg_load = round(sum(four_week_loads) / 4.0, 1)

    # Days since last rest day, current streak, ACWR inputs, nutrition, health,
    # steps, wellness, weight — all independent, run concurrently.
    last_rest_q = (
        select(date_col.label("d"))
        .where(UserActivity.user_id == current_user.id, UserActivity.is_rest_day.is_(True))
        .order_by(date_col.desc())
        .limit(1)
    )
    act_dates_q = (
        select(date_col.label("d"))
        .where(UserActivity.user_id == current_user.id, UserActivity.is_rest_day.is_(False))
        .group_by(date_col)
        .order_by(date_col.desc())
    )
    all_dates_q = (
        select(date_col.label("d"))
        .where(UserActivity.user_id == current_user.id)
        .group_by(date_col)
        .order_by(date_col.desc())
    )
    load_day_q = (
        select(
            date_col.label("d"),
            func.coalesce(func.sum(UserActivity.training_load), 0).label("load"),
        )
        .where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= twenty_eight_days_ago,
        )
        .group_by(date_col)
    )

    last_rest_row, act_dates_rows, all_dates_rows, load_day_rows = await asyncio.gather(
        _run_query(last_rest_q, mode="first"),
        _run_query(act_dates_q),
        _run_query(all_dates_q),
        _run_query(load_day_q),
    )

    if last_rest_row:
        days_since_rest = (today - last_rest_row.d).days
    else:
        act_dates = [row.d for row in act_dates_rows]
        days_since_rest = 0
        check = today
        for d in act_dates:
            if d == check or d == check - timedelta(days=1):
                days_since_rest += 1
                check = d - timedelta(days=1)
            else:
                break

    all_dates = [row.d for row in all_dates_rows]
    current_streak = 0
    if all_dates:
        check = today
        for d in all_dates:
            if d == check or d == check - timedelta(days=1):
                if d < check:
                    check = d
                current_streak += 1
                check = d - timedelta(days=1)
            else:
                break

    load_by_day = {row.d: int(row.load) for row in load_day_rows}
    acute_load = sum(v for d, v in load_by_day.items() if d >= seven_days_ago)
    chronic_weekly = sum(load_by_day.values()) / 4
    has_28_days = bool(all_dates and (today - min(all_dates)).days >= 28)
    from app.services.training_load import compute_acwr
    acwr, acwr_status = compute_acwr(
        acute_load=acute_load,
        chronic_weekly_avg=chronic_weekly,
        has_28_days=has_28_days,
    )

    # ── Nutrition / Health / Steps / Wellness / Weight / Readiness delta ──────
    # All independent of one another — fan out in a single gather.
    now_dt = datetime.utcnow()
    start_today = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end_today = start_today + timedelta(days=1)
    start_week_dt = datetime.combine(week_start, datetime.min.time())
    wt_date_col = cast(WeightLog.logged_at, Date)
    since_28 = today - timedelta(days=28)

    from datetime import timedelta as _td
    from app.models.diagnosis import Diagnosis as _DiagModel
    past_cutoff = (datetime.utcnow() - _td(days=7)).date()

    meals_q = select(NutritionLog).where(
        NutritionLog.user_id == current_user.id,
        NutritionLog.logged_at >= start_today,
        NutritionLog.logged_at < end_today,
    )
    week_cal_q = select(func.coalesce(func.sum(NutritionLog.calories), 0)).where(
        NutritionLog.user_id == current_user.id,
        NutritionLog.logged_at >= start_week_dt,
    )
    health_q = select(HealthSnapshot).where(
        HealthSnapshot.user_id == current_user.id,
        HealthSnapshot.date == yesterday,
    )
    steps_q = select(DailySteps).where(
        DailySteps.user_id == current_user.id,
        DailySteps.date == str(today),
    )
    wellness_q = select(WellnessCheckin).where(
        WellnessCheckin.user_id == current_user.id,
        WellnessCheckin.date == today,
    )
    latest_weight_q = (
        select(WeightLog)
        .where(WeightLog.user_id == current_user.id)
        .order_by(WeightLog.logged_at.desc())
        .limit(1)
    )
    wt_logs_q = (
        select(WeightLog)
        .where(WeightLog.user_id == current_user.id, wt_date_col >= since_28)
        .order_by(WeightLog.logged_at.asc())
    )
    weight_today_q = select(WeightLog).where(
        WeightLog.user_id == current_user.id,
        wt_date_col == today,
    )
    past_diag_q = (
        select(_DiagModel.readiness_score)
        .where(
            _DiagModel.user_id == current_user.id,
            cast(_DiagModel.generated_at, Date) <= past_cutoff,
            _DiagModel.readiness_score.is_not(None),
        )
        .order_by(_DiagModel.generated_at.desc())
        .limit(1)
    )

    (
        meals_today,
        calories_this_week_raw,
        last_night,
        steps_row,
        today_wellness,
        latest_weight_row,
        wt_logs,
        weight_today_row,
        past_score_or_exc,
        readiness,
    ) = await asyncio.gather(
        _run_query(meals_q, mode="scalars_all"),
        _run_query(week_cal_q, mode="scalar"),
        _run_query(health_q, mode="scalar_one_or_none"),
        _run_query(steps_q, mode="scalar_one_or_none"),
        _run_query(wellness_q, mode="scalar_one_or_none"),
        _run_query(latest_weight_q, mode="scalar_one_or_none"),
        _run_query(wt_logs_q, mode="scalars_all"),
        _run_query(weight_today_q, mode="scalar_one_or_none"),
        _run_query(past_diag_q, mode="scalar_one_or_none"),
        calculate_readiness(current_user.id, db),
        return_exceptions=False,
    )

    calories_today = round(sum(m.calories or 0 for m in meals_today))
    protein_today = round(sum(m.protein_g or 0 for m in meals_today), 1)
    carbs_today = round(sum(m.carbs_g or 0 for m in meals_today), 1)
    fat_today = round(sum(m.fat_g or 0 for m in meals_today), 1)
    meals_logged_today = len(meals_today) > 0
    calorie_deficit = (calories_today - daily_calorie_target) if daily_calorie_target else None
    calories_this_week = round(calories_this_week_raw or 0)

    sleep_hours = last_night.sleep_duration_hours if last_night else None
    hrv_ms = last_night.hrv_ms if last_night else None
    resting_heart_rate = last_night.resting_heart_rate if last_night else None

    steps_today = steps_row.steps if steps_row else 0

    energy_today = today_wellness.energy if today_wellness else None
    soreness_today = today_wellness.soreness if today_wellness else None
    mood_today = today_wellness.mood if today_wellness else None
    # Hooper Index fields
    sleep_quality_today = today_wellness.sleep_quality if today_wellness else None
    fatigue_today = today_wellness.fatigue if today_wellness else None
    stress_today = today_wellness.stress if today_wellness else None
    muscle_soreness_today = today_wellness.muscle_soreness if today_wellness else None
    wellness_logged_today = (
        today_wellness is not None
        and all(
            getattr(today_wellness, f) is not None
            for f in ("sleep_quality", "fatigue", "stress", "muscle_soreness")
        )
    )

    # ── Weight ────────────────────────────────────────────────────────────────
    current_weight_kg = latest_weight_row.weight_kg if latest_weight_row else current_user.weight_kg

    weight_trend: str | None = None
    weekly_weight_change_kg: float | None = None
    weight_goal_alignment: str = "neutral"
    if len(wt_logs) >= 2:
        xs = list(range(len(wt_logs)))
        ys = [w.weight_kg for w in wt_logs]
        n = len(xs)
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
        den = sum((xs[i] - mean_x) ** 2 for i in range(n))
        slope_per_day = (num / den) if den != 0 else 0.0
        rate_per_week = slope_per_day * 7
        weekly_weight_change_kg = round(rate_per_week, 3)
        if rate_per_week < -0.05:
            weight_trend = "losing"
        elif rate_per_week > 0.05:
            weight_trend = "gaining"
        else:
            weight_trend = "stable"
        goal = (primary_goal or "").lower()
        if any(k in goal for k in ["fat", "loss", "cut", "lose", "lean"]):
            weight_goal_alignment = "on_track" if weight_trend == "losing" else "off_track"
        elif any(k in goal for k in ["muscle", "gain", "bulk", "build", "mass"]):
            weight_goal_alignment = "on_track" if weight_trend == "gaining" else "off_track"
        else:
            weight_goal_alignment = "neutral"

    weight_logged_today = weight_today_row is not None

    # 7-day readiness delta: today's score vs this user's score 7 days ago.
    try:
        past_score = past_score_or_exc
        readiness_delta_7d: int | None = (
            int(readiness["score"] - past_score) if past_score is not None else None
        )
    except Exception as e:
        logger.warning("readiness_delta_7d compute failed for user %s: %s", current_user.id, e)
        readiness_delta_7d = None

    last_session_out = None
    if last_session:
        last_session_out = {
            "id": str(last_session.id),
            "name": last_session.activity_type,
            "sport_type": last_session.sport_category or last_session.activity_type,
            "date": last_session.logged_at.isoformat(),
            "duration_minutes": last_session.duration_minutes,
            "training_load": last_session.training_load,
            "rpe": last_session.rpe,
            "autopsy_snippet": (last_session.autopsy_text or "")[:200] or None,
        }

    return {
        "display_name": display_name,
        "primary_goal": primary_goal,
        "sport_tags": sport_tags,
        "weekly_training_goal": weekly_training_goal,
        # Readiness (from single shared service — same score used everywhere)
        "readiness_score": readiness["score"],
        "readiness_label": readiness["label"],
        "readiness_color": readiness["color"],
        "readiness_delta_7d": readiness_delta_7d,
        "readiness_primary_factor": readiness["primary_factor"],
        "data_confidence": readiness["data_confidence"],
        "components_used": readiness["components_used"],
        "breakdown": readiness["breakdown"],
        "hardware_available": readiness["hardware_available"],
        "last_session": last_session_out,
        "sessions_this_week": sessions_this_week,
        "weekly_load": weekly_load,
        "last_week_load": last_week_load,
        "days_since_rest": max(0, days_since_rest),
        "active_days_this_week": active_days_this_week,
        "four_week_avg_load": four_week_avg_load,
        "current_streak": current_streak,
        "weekly_goal_progress": sessions_this_week,
        "acwr": acwr,
        "acwr_status": acwr_status,
        "calories_today": calories_today,
        "protein_today": protein_today,
        "carbs_today": carbs_today,
        "fat_today": fat_today,
        "calorie_target": daily_calorie_target,
        "protein_target": macro_targets["protein_target"],
        "carbs_target": macro_targets["carbs_target"],
        "fat_target": macro_targets["fat_target"],
        "calorie_deficit": calorie_deficit,
        "meals_logged_today": meals_logged_today,
        "calories_this_week": calories_this_week,
        "sleep_hours": sleep_hours,
        "hrv_ms": hrv_ms,
        "resting_heart_rate": resting_heart_rate,
        "steps_today": steps_today,
        # Wellness — legacy fields
        "energy_today": energy_today,
        "soreness_today": soreness_today,
        "mood_today": mood_today,
        # Hooper Index fields
        "sleep_quality_today": sleep_quality_today,
        "fatigue_today": fatigue_today,
        "stress_today": stress_today,
        "muscle_soreness_today": muscle_soreness_today,
        "wellness_logged_today": wellness_logged_today,
        # Weight
        "current_weight_kg": current_weight_kg,
        "weight_trend": weight_trend,
        "weekly_weight_change_kg": weekly_weight_change_kg,
        "weight_goal_alignment": weight_goal_alignment,
        "weight_logged_today": weight_logged_today,
        "weight_unit": getattr(current_user, "weight_unit", "kg") or "kg",
    }


# ── Diagnosis ──────────────────────────────────────────────────────────────────

@router.post("/diagnosis")
async def get_diagnosis(
    force: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.user_time import user_today
    today = user_today(current_user)
    now = datetime.utcnow()
    one_hour_ago = now - timedelta(hours=1)

    # Check cache
    cached_res = await db.execute(
        select(Diagnosis)
        .where(Diagnosis.user_id == current_user.id, Diagnosis.date == today)
        .order_by(Diagnosis.generated_at.desc())
        .limit(1)
    )
    cached = cached_res.scalar_one_or_none()

    def _cached_response(entry: Diagnosis, rate_limited: bool = False) -> dict:
        return {
            "diagnosis_text": _strip_fences(entry.diagnosis_text or ""),
            "contributing_factors": entry.contributing_factors or [],
            "recommendation": entry.recommendation or "",
            "tone": entry.tone or "cautionary",
            "generated_at": entry.generated_at.isoformat(),
            "cached": True,
            "rate_limited": rate_limited,
        }

    # Always compute fresh dashboard data so we can attach the current
    # readiness score/color to the response — wellness.tsx reads these to
    # render its recovery card. Cached diagnosis text is still served when
    # available, but score/color reflect "now", not when the cache was made.
    try:
        dashboard_data = await _build_dashboard(current_user, db)
    except Exception as exc:
        logger.error("Dashboard fetch failed for diagnosis: %s", exc)
        dashboard_data = None

    def _attach_recovery(payload: dict) -> dict:
        if dashboard_data is not None:
            payload["recovery_score"] = dashboard_data.get("readiness_score") or 0
            payload["recovery_color"] = dashboard_data.get("readiness_color") or "yellow"
        else:
            payload.setdefault("recovery_score", 0)
            payload.setdefault("recovery_color", "yellow")
        return payload

    if cached and not force:
        return _attach_recovery(_cached_response(cached))

    if cached and force and cached.generated_at > one_hour_ago:
        return _attach_recovery(_cached_response(cached, rate_limited=True))

    if dashboard_data is None:
        return _attach_recovery({
            "diagnosis_text": "Could not generate diagnosis — data unavailable.",
            "contributing_factors": [],
            "recommendation": "",
            "tone": "cautionary",
            "cached": False,
        })

    openai_key = settings.OPENAI_API_KEY
    if not openai_key:
        return _attach_recovery({
            "diagnosis_text": "AI diagnosis unavailable — OPENAI_API_KEY not configured.",
            "contributing_factors": [],
            "recommendation": "",
            "tone": "cautionary",
            "cached": False,
        })

    system_prompt = (
        "You are ORYX, an elite performance coach. Your job is to give the athlete one sharp, "
        "specific insight about their body today in plain English. Be direct. Be specific. Use their "
        "name. Connect the data. Maximum 2 sentences for the diagnosis. One sentence for the "
        "recommendation. No filler words. No generic advice. No phrases like it is important to or "
        "make sure to or you should consider. Just tell them exactly what is happening and exactly "
        "what to do about it. Quality over quantity. Every word must matter. "
        "Return a JSON object with exactly these fields: diagnosis (string, maximum 2 sentences), "
        "recommendation (string, maximum 1 sentence), main_factors (array of strings maximum 3), "
        "tone (positive, cautionary, or warning). Nothing else."
    )
    user_message = _build_diagnosis_prompt(dashboard_data)

    try:
        client = AsyncOpenAI(api_key=openai_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=300,
        )
        result_text = response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("OpenAI diagnosis failed: %s", exc)
        return _attach_recovery({
            "diagnosis_text": "AI diagnosis temporarily unavailable. Try again shortly.",
            "contributing_factors": [],
            "recommendation": "",
            "tone": "cautionary",
            "cached": False,
        })

    parsed = _parse_diagnosis_response(result_text)

    if cached:
        cached.diagnosis_text = parsed["diagnosis_text"]
        cached.contributing_factors = parsed["contributing_factors"]
        cached.recommendation = parsed["recommendation"]
        cached.tone = parsed["tone"]
        cached.generated_at = now
    else:
        db.add(
            Diagnosis(
                user_id=current_user.id,
                date=today,
                diagnosis_text=parsed["diagnosis_text"],
                contributing_factors=parsed["contributing_factors"],
                recommendation=parsed["recommendation"],
                tone=parsed["tone"],
                generated_at=now,
            )
        )
    await db.flush()

    return _attach_recovery({
        "diagnosis_text": parsed["diagnosis_text"],
        "contributing_factors": parsed["contributing_factors"],
        "recommendation": parsed["recommendation"],
        "tone": parsed["tone"],
        "generated_at": now.isoformat(),
        "cached": False,
    })
