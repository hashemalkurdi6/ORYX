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
from app.routers.auth import get_current_user

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


def _compute_readiness(
    sleep_hours: float | None,
    days_since_rest: int,
    yesterday_load: int,
    soreness: int | None,
    energy: int | None,
    acwr: float | None,
) -> dict:
    deductions: dict[str, int] = {}

    # Sleep
    if sleep_hours is not None:
        if sleep_hours < 6:
            deductions["Poor sleep last night"] = 25
        elif sleep_hours < 7:
            deductions["Below-average sleep"] = 15
        elif sleep_hours < 8:
            deductions["Slightly short sleep"] = 5

    # Rest day streak
    if days_since_rest >= 6:
        deductions[f"No rest in {days_since_rest} days"] = 30
    elif days_since_rest == 5:
        deductions[f"No rest in {days_since_rest} days"] = 20
    elif days_since_rest == 4:
        deductions[f"No rest in {days_since_rest} days"] = 10
    elif days_since_rest == 3:
        deductions[f"No rest in {days_since_rest} days"] = 5

    # Yesterday's load
    if yesterday_load > 400:
        deductions["High training load yesterday"] = 20
    elif yesterday_load > 200:
        deductions["Moderate training load yesterday"] = 10

    # Soreness (1–5 scale, 1=none, 5=severe)
    if soreness is not None:
        if soreness >= 4:
            deductions["High muscle soreness"] = 25
        elif soreness == 3:
            deductions["Moderate muscle soreness"] = 15
        elif soreness == 2:
            deductions["Mild muscle soreness"] = 5

    # Energy (1–5 scale, 1=very low)
    if energy is not None:
        if energy <= 2:
            deductions["Low energy levels"] = 15
        elif energy == 3:
            deductions["Medium energy levels"] = 5

    score = max(0, min(100, 100 - sum(deductions.values())))

    # Rule 2: ACWR > 1.3 → cap at caution zone (59 max)
    if acwr is not None and acwr > 1.3 and score >= 60:
        extra = score - 59
        deductions["High training load spike (ACWR)"] = extra
        score = max(0, min(100, 100 - sum(deductions.values())))

    primary_factor = "Well-balanced recovery"
    if deductions:
        primary_factor = max(deductions, key=lambda k: deductions[k])

    if score >= 80:
        label, color = "Ready to Train", "green"
    elif score >= 60:
        label, color = "Train with Caution", "amber"
    else:
        label, color = "Rest Recommended", "red"

    return {
        "readiness_score": score,
        "readiness_label": label,
        "readiness_color": color,
        "readiness_primary_factor": primary_factor,
    }


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

    lines.append(f"READINESS SCORE: {data['readiness_score']} — {data['readiness_label']}")
    lines.append(f"Primary readiness factor: {data['readiness_primary_factor']}")
    lines.append("")
    lines.append(
        "Based on ALL of this data together, explain why this athlete is performing and recovering "
        "the way they are today. Explicitly connect nutrition to training performance where relevant. "
        "Explicitly connect sleep to recovery where relevant. Explicitly connect training load to "
        "soreness and readiness where relevant."
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

    # ── Readiness ─────────────────────────────────────────────────────────────
    readiness = _compute_readiness(
        sleep_hours=sleep_hours,
        days_since_rest=days_since_rest,
        yesterday_load=yesterday_load,
        soreness=soreness_today,
        energy=energy_today,
        acwr=acwr,
    )

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
        **readiness,
        "last_session": last_session_out,
        "sessions_this_week": sessions_this_week,
        "weekly_load": weekly_load,
        "last_week_load": last_week_load,
        "days_since_rest": days_since_rest,
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
        "energy_today": energy_today,
        "soreness_today": soreness_today,
        "mood_today": mood_today,
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
        "You are ORYX, an elite personal performance coach with expertise in sports science, "
        "nutrition, and recovery. You have access to a complete picture of the athlete's day and "
        "recent history. Your job is to explain in plain English why their body is performing the "
        "way it is, connecting all available data sources together. Always look for relationships "
        "between nutrition and training performance, between sleep and recovery, between training "
        "load and soreness. Never analyze data in isolation. Be direct, specific, and personalized. "
        "Use the athlete's name. Keep the diagnosis to 3 to 4 sentences maximum. End with one "
        "specific actionable recommendation. After the diagnosis return a raw JSON object on a new "
        "line — no markdown, no code fences, just the plain JSON object — with keys: "
        "diagnosis (string), main_factors (array of strings max 3), recommendation (string), "
        "tone (positive, cautionary, or warning)."
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
            max_tokens=1000,
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
