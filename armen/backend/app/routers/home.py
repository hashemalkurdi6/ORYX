import json
import logging
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from openai import AsyncOpenAI
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_macro_targets(calorie_target: int | None, primary_goal: str | None) -> dict:
    if not calorie_target:
        return {"protein_target": None, "carbs_target": None, "fat_target": None}
    goal = (primary_goal or "").lower()
    if any(k in goal for k in ["muscle", "gain", "bulk", "build", "mass"]):
        p_pct, c_pct, f_pct = 0.30, 0.45, 0.25
    elif any(k in goal for k in ["fat", "loss", "cut", "lose", "weight", "lean"]):
        p_pct, c_pct, f_pct = 0.35, 0.35, 0.30
    elif any(k in goal for k in ["perform", "athlete", "sport", "endurance", "speed"]):
        p_pct, c_pct, f_pct = 0.25, 0.55, 0.20
    else:
        p_pct, c_pct, f_pct = 0.25, 0.50, 0.25
    return {
        "protein_target": round(calorie_target * p_pct / 4),
        "carbs_target": round(calorie_target * c_pct / 4),
        "fat_target": round(calorie_target * f_pct / 9),
    }


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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
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
    daily_calorie_target = current_user.daily_calorie_target
    weekly_training_goal = _parse_weekly_training_days(current_user.weekly_training_days)
    macro_targets = _compute_macro_targets(daily_calorie_target, primary_goal)

    # ── Training ──────────────────────────────────────────────────────────────
    last_session_res = await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == current_user.id, UserActivity.is_rest_day.is_(False))
        .order_by(UserActivity.logged_at.desc())
        .limit(1)
    )
    last_session = last_session_res.scalar_one_or_none()

    sw_count_res = await db.execute(
        select(func.count()).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= week_start,
        )
    )
    sessions_this_week = sw_count_res.scalar() or 0

    # Distinct active days this week (for "days active" fallback when streak = 0)
    active_days_res = await db.execute(
        select(func.count(func.distinct(date_col))).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= week_start,
        )
    )
    active_days_this_week = int(active_days_res.scalar() or 0)

    tw_load_res = await db.execute(
        select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= week_start,
        )
    )
    weekly_load = int(tw_load_res.scalar() or 0)

    lw_load_res = await db.execute(
        select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col >= last_week_start,
            date_col < week_start,
        )
    )
    last_week_load = int(lw_load_res.scalar() or 0)

    # 4-week average load (4 complete weeks before this week)
    four_week_loads = []
    for i in range(4):
        ws = week_start - timedelta(weeks=i + 1)
        we = week_start - timedelta(weeks=i)
        wl_res = await db.execute(
            select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
                UserActivity.user_id == current_user.id,
                UserActivity.is_rest_day.is_(False),
                date_col >= ws,
                date_col < we,
            )
        )
        four_week_loads.append(int(wl_res.scalar() or 0))
    four_week_avg_load = round(sum(four_week_loads) / 4.0, 1)

    yday_load_res = await db.execute(
        select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col == yesterday,
        )
    )
    yesterday_load = int(yday_load_res.scalar() or 0)

    # Days since last rest day
    last_rest_res = await db.execute(
        select(date_col.label("d"))
        .where(UserActivity.user_id == current_user.id, UserActivity.is_rest_day.is_(True))
        .order_by(date_col.desc())
        .limit(1)
    )
    last_rest_row = last_rest_res.first()
    if last_rest_row:
        days_since_rest = (today - last_rest_row.d).days
    else:
        act_dates_res = await db.execute(
            select(date_col.label("d"))
            .where(UserActivity.user_id == current_user.id, UserActivity.is_rest_day.is_(False))
            .group_by(date_col)
            .order_by(date_col.desc())
        )
        act_dates = [row.d for row in act_dates_res]
        days_since_rest = 0
        check = today
        for d in act_dates:
            if d == check or d == check - timedelta(days=1):
                days_since_rest += 1
                check = d - timedelta(days=1)
            else:
                break

    # Current streak
    all_dates_res = await db.execute(
        select(date_col.label("d"))
        .where(UserActivity.user_id == current_user.id)
        .group_by(date_col)
        .order_by(date_col.desc())
    )
    all_dates = [row.d for row in all_dates_res]
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

    # ACWR
    load_day_res = await db.execute(
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
    load_by_day = {row.d: int(row.load) for row in load_day_res}
    acute_load = sum(v for d, v in load_by_day.items() if d >= seven_days_ago)
    chronic_weekly = sum(load_by_day.values()) / 4

    acwr: float | None = None
    acwr_status = "insufficient_data"
    if all_dates and (today - min(all_dates)).days >= 28 and chronic_weekly > 0:
        acwr = round(acute_load / chronic_weekly, 2)
        if acwr < 0.8:
            acwr_status = "undertraining"
        elif acwr <= 1.3:
            acwr_status = "optimal"
        elif acwr <= 1.5:
            acwr_status = "caution"
        else:
            acwr_status = "high_risk"

    # ── Nutrition ─────────────────────────────────────────────────────────────
    now_dt = datetime.utcnow()
    start_today = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end_today = start_today + timedelta(days=1)
    start_week_dt = datetime.combine(week_start, datetime.min.time())

    meals_res = await db.execute(
        select(NutritionLog).where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= start_today,
            NutritionLog.logged_at < end_today,
        )
    )
    meals_today = meals_res.scalars().all()
    calories_today = round(sum(m.calories or 0 for m in meals_today))
    protein_today = round(sum(m.protein_g or 0 for m in meals_today), 1)
    carbs_today = round(sum(m.carbs_g or 0 for m in meals_today), 1)
    fat_today = round(sum(m.fat_g or 0 for m in meals_today), 1)
    meals_logged_today = len(meals_today) > 0
    calorie_deficit = (calories_today - daily_calorie_target) if daily_calorie_target else None

    week_cal_res = await db.execute(
        select(func.coalesce(func.sum(NutritionLog.calories), 0)).where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= start_week_dt,
        )
    )
    calories_this_week = round(week_cal_res.scalar() or 0)

    # ── Health snapshots ──────────────────────────────────────────────────────
    health_res = await db.execute(
        select(HealthSnapshot).where(
            HealthSnapshot.user_id == current_user.id,
            HealthSnapshot.date == yesterday,
        )
    )
    last_night = health_res.scalar_one_or_none()
    sleep_hours = last_night.sleep_duration_hours if last_night else None
    hrv_ms = last_night.hrv_ms if last_night else None
    resting_heart_rate = last_night.resting_heart_rate if last_night else None

    # ── Steps ─────────────────────────────────────────────────────────────────
    steps_res = await db.execute(
        select(DailySteps).where(
            DailySteps.user_id == current_user.id,
            DailySteps.date == str(today),
        )
    )
    steps_row = steps_res.scalar_one_or_none()
    steps_today = steps_row.steps if steps_row else 0

    # ── Wellness ──────────────────────────────────────────────────────────────
    wellness_res = await db.execute(
        select(WellnessCheckin).where(
            WellnessCheckin.user_id == current_user.id,
            WellnessCheckin.date == today,
        )
    )
    today_wellness = wellness_res.scalar_one_or_none()
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
    wt_date_col = cast(WeightLog.logged_at, Date)
    latest_weight_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
        ).order_by(WeightLog.logged_at.desc()).limit(1)
    )
    latest_weight_row = latest_weight_res.scalar_one_or_none()
    current_weight_kg = latest_weight_row.weight_kg if latest_weight_row else current_user.weight_kg

    # 28-day trend for rate and weekly change
    weight_trend: str | None = None
    weekly_weight_change_kg: float | None = None
    weight_goal_alignment: str = "neutral"
    since_28 = today - timedelta(days=28)
    wt_logs_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
            wt_date_col >= since_28,
        ).order_by(WeightLog.logged_at.asc())
    )
    wt_logs = wt_logs_res.scalars().all()
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

    # Logged weight today?
    weight_logged_today_res = await db.execute(
        select(WeightLog).where(
            WeightLog.user_id == current_user.id,
            wt_date_col == today,
        )
    )
    weight_logged_today = weight_logged_today_res.scalar_one_or_none() is not None

    # ── Readiness — single source of truth via readiness_service ──────────────
    readiness = await calculate_readiness(current_user.id, db)

    # 7-day readiness delta: today's score vs this user's score 7 days ago (or
    # None if no history). Kept light — no trend chart, just a delta number.
    from datetime import timedelta as _td
    from app.models.diagnosis import Diagnosis as _DiagModel
    try:
        past_cutoff = (datetime.utcnow() - _td(days=7)).date()
        past_res = await db.execute(
            select(_DiagModel.readiness_score)
            .where(
                _DiagModel.user_id == current_user.id,
                cast(_DiagModel.generated_at, Date) <= past_cutoff,
                _DiagModel.readiness_score.is_not(None),
            )
            .order_by(_DiagModel.generated_at.desc())
            .limit(1)
        )
        past_score = past_res.scalar_one_or_none()
        readiness_delta_7d: int | None = (
            int(readiness["score"] - past_score) if past_score is not None else None
        )
    except Exception:
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
    today = date.today()
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

    if cached and not force:
        return _cached_response(cached)

    if cached and force and cached.generated_at > one_hour_ago:
        return _cached_response(cached, rate_limited=True)

    # Fetch dashboard data to build prompt
    try:
        dashboard_data = await get_dashboard(current_user=current_user, db=db)
    except Exception as exc:
        logger.error("Dashboard fetch failed for diagnosis: %s", exc)
        return {
            "diagnosis_text": "Could not generate diagnosis — data unavailable.",
            "contributing_factors": [],
            "recommendation": "",
            "tone": "cautionary",
            "cached": False,
        }

    openai_key = settings.OPENAI_API_KEY
    if not openai_key:
        return {
            "diagnosis_text": "AI diagnosis unavailable — OPENAI_API_KEY not configured.",
            "contributing_factors": [],
            "recommendation": "",
            "tone": "cautionary",
            "cached": False,
        }

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
        return {
            "diagnosis_text": "AI diagnosis temporarily unavailable. Try again shortly.",
            "contributing_factors": [],
            "recommendation": "",
            "tone": "cautionary",
            "cached": False,
        }

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

    return {
        "diagnosis_text": parsed["diagnosis_text"],
        "contributing_factors": parsed["contributing_factors"],
        "recommendation": parsed["recommendation"],
        "tone": parsed["tone"],
        "generated_at": now.isoformat(),
        "cached": False,
    }
