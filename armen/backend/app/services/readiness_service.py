"""ORYX Readiness Service — single source of truth for readiness score calculation.

The score is built from up to 4 components. Missing components are excluded and
weights are redistributed proportionally so they always sum to 1.0.

Component weights (defaults):
    Hooper Index          0.40
    Training Load         0.35
    Nutritional Recovery  0.15
    Sleep Score           0.10

Hardware extension slots (reserved, currently None):
    Component 5: HRV
    Component 6: Resting Heart Rate
    Component 7: Blood Oxygen
"""
import logging
from datetime import date, datetime, timedelta
from statistics import mean, stdev
from uuid import UUID

from sqlalchemy import cast, Date, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health_data import HealthSnapshot
from app.models.nutrition import NutritionLog
from app.models.readiness_cache import ReadinessCache
from app.models.user import User
from app.models.user_activity import UserActivity
from app.models.wellness import WellnessCheckin

logger = logging.getLogger(__name__)

_HOOPER_FIELDS = ("sleep_quality", "fatigue", "stress", "muscle_soreness")

_DEFAULT_WEIGHTS: dict[str, float] = {
    "hooper": 0.40,
    "training_load": 0.35,
    "nutrition": 0.15,
    "sleep": 0.10,
}

_COMPONENT_LABELS: dict[str, str] = {
    "hooper": "Hooper Wellness Index",
    "training_load": "Training Load (EWMA-ACWR)",
    "nutrition": "Nutritional Recovery",
    "sleep": "Sleep Quality",
}

_CACHE_TTL_SECONDS = 3600  # 1 hour


# ── Public API ─────────────────────────────────────────────────────────────────

async def calculate_readiness(user_id: UUID, db: AsyncSession) -> dict:
    """Calculate (or return cached) readiness score for a user.

    Returns a dict with: score, label, color, primary_factor, data_confidence,
    components_used, breakdown, hardware_available.
    """
    # Check cache first
    cache_res = await db.execute(
        select(ReadinessCache).where(ReadinessCache.user_id == user_id)
    )
    cached = cache_res.scalar_one_or_none()
    if cached and (datetime.utcnow() - cached.calculated_at).total_seconds() < _CACHE_TTL_SECONDS:
        return {
            "score": cached.score,
            "label": cached.label,
            "color": cached.color,
            "primary_factor": cached.primary_factor,
            "data_confidence": cached.data_confidence,
            "components_used": cached.components_used,
            "breakdown": cached.breakdown,
            "hardware_available": cached.hardware_available,
        }

    today = date.today()
    yesterday = today - timedelta(days=1)

    # Fetch user profile for nutrition component
    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()

    # ── Compute each component ─────────────────────────────────────────────────
    scores: dict[str, float] = {}
    sources: dict[str, str] = {}

    h_score, h_source = await _compute_hooper(user_id, today, yesterday, db)
    if h_score is not None:
        scores["hooper"] = h_score
        sources["hooper"] = h_source

    tl_score, tl_source = await _compute_training_load(user_id, today, yesterday, db)
    if tl_score is not None:
        scores["training_load"] = tl_score
        sources["training_load"] = tl_source

    n_score, n_source = await _compute_nutrition(user_id, user, today, yesterday, db)
    if n_score is not None:
        scores["nutrition"] = n_score
        sources["nutrition"] = n_source

    s_score, s_source = await _compute_sleep(user_id, yesterday, db)
    if s_score is not None:
        scores["sleep"] = s_score
        sources["sleep"] = s_source

    # Hardware slots: HRV, Resting HR, Blood Oxygen — all None until connected
    # When a component returns a value here it is incorporated automatically
    # via the weight redistribution logic below.

    # ── Assemble result ────────────────────────────────────────────────────────
    hardware_available = await _get_hardware_status(user_id, yesterday, db)

    if not scores:
        result = {
            "score": 75,
            "label": "Insufficient Data",
            "color": "amber",
            "primary_factor": "Log activities, meals, and wellness check-ins to unlock readiness scoring",
            "data_confidence": "Directional Only",
            "components_used": [],
            "breakdown": {},
            "hardware_available": hardware_available,
        }
    else:
        available_keys = list(scores.keys())
        weights = _redistribute_weights(available_keys)

        final_score = max(0, min(100, round(
            sum(weights[k] * scores[k] for k in available_keys)
        )))

        label, color = _score_to_label_color(final_score)

        n = len(available_keys)
        if n >= 4:
            confidence = "High Confidence"
        elif n == 3:
            confidence = "Medium Confidence"
        elif n == 2:
            confidence = "Low Confidence"
        else:
            confidence = "Directional Only"

        # Primary factor: lowest weighted-score component
        worst_key = min(available_keys, key=lambda k: scores[k] * weights[k])
        primary_factor = _factor_text(worst_key, scores[worst_key])

        breakdown: dict[str, dict] = {
            k: {
                "name": _COMPONENT_LABELS[k],
                "score": round(scores[k]),
                "default_weight": _DEFAULT_WEIGHTS[k],
                "adjusted_weight": round(weights[k], 3),
                "data_source": sources[k],
            }
            for k in available_keys
        }

        result = {
            "score": final_score,
            "label": label,
            "color": color,
            "primary_factor": primary_factor,
            "data_confidence": confidence,
            "components_used": [_COMPONENT_LABELS[k] for k in available_keys],
            "breakdown": breakdown,
            "hardware_available": hardware_available,
        }

    await _save_cache(user_id, result, db)
    return result


async def invalidate_readiness_cache(user_id: UUID, db: AsyncSession) -> None:
    """Delete cached readiness for a user. Call after any data change."""
    result = await db.execute(
        select(ReadinessCache).where(ReadinessCache.user_id == user_id)
    )
    entry = result.scalar_one_or_none()
    if entry:
        await db.delete(entry)
        await db.flush()


# ── Component 1: Hooper Index ──────────────────────────────────────────────────

async def _compute_hooper(
    user_id: UUID, today: date, yesterday: date, db: AsyncSession
) -> tuple[float | None, str]:
    """Hooper Index from today's (or yesterday's) wellness check-in.

    hooper_total = sum of 4 questions (each 1–7) → range 4 to 28
    hooper_score = ((28 - hooper_total) / 24) × 100 → 0 to 100 (100=optimal)
    Yesterday's data incurs a 5-point penalty.
    """
    for check_date, penalty, date_label in [
        (today, 0, "Today's wellness check-in"),
        (yesterday, 5, "Yesterday's wellness check-in (−5 recency penalty)"),
    ]:
        res = await db.execute(
            select(WellnessCheckin).where(
                WellnessCheckin.user_id == user_id,
                WellnessCheckin.date == check_date,
            )
        )
        w = res.scalar_one_or_none()
        if w and all(getattr(w, f) is not None for f in _HOOPER_FIELDS):
            total = sum(getattr(w, f) for f in _HOOPER_FIELDS)
            score = ((28 - total) / 24) * 100 - penalty
            return round(max(0.0, min(100.0, score))), date_label

    return None, ""


# ── Component 2: Training Load (EWMA-ACWR + monotony + consecutive rest) ───────

async def _compute_training_load(
    user_id: UUID, today: date, yesterday: date, db: AsyncSession
) -> tuple[float | None, str]:
    twenty_eight_days_ago = today - timedelta(days=28)
    seven_days_ago = today - timedelta(days=7)
    date_col = cast(UserActivity.logged_at, Date)

    load_res = await db.execute(
        select(
            date_col.label("d"),
            func.coalesce(func.sum(UserActivity.training_load), 0).label("load"),
        )
        .where(
            UserActivity.user_id == user_id,
            UserActivity.is_rest_day.is_(False),
            date_col >= twenty_eight_days_ago,
        )
        .group_by(date_col)
    )
    load_by_day: dict[date, int] = {row.d: int(row.load) for row in load_res}

    if not load_by_day:
        return None, ""

    # ── EWMA-ACWR ─────────────────────────────────────────────────────────────
    lambda_a = 2 / (7 + 1)    # 0.25
    lambda_c = 2 / (28 + 1)   # ~0.0667

    ewma_acute = 0.0
    ewma_chronic = 0.0
    for i in range(28, 0, -1):
        d = today - timedelta(days=i)
        load = float(load_by_day.get(d, 0))
        ewma_acute = load * lambda_a + ewma_acute * (1 - lambda_a)
        ewma_chronic = load * lambda_c + ewma_chronic * (1 - lambda_c)

    has_7_days = any((today - timedelta(days=i)) in load_by_day for i in range(1, 8))
    insufficient = not has_7_days or ewma_chronic == 0
    acwr = 1.0 if insufficient else ewma_acute / ewma_chronic

    if acwr < 0.8:
        acwr_score = 60.0
    elif acwr <= 1.0:
        acwr_score = 100.0
    elif acwr <= 1.3:
        acwr_score = 85.0
    elif acwr <= 1.5:
        acwr_score = 50.0
    else:
        acwr_score = 20.0

    # ── Monotony ───────────────────────────────────────────────────────────────
    last_7 = [float(load_by_day.get(today - timedelta(days=i), 0)) for i in range(1, 8)]
    m_mean = mean(last_7)
    try:
        m_std = stdev(last_7)
    except Exception:
        m_std = 0.0
    monotony = m_mean / m_std if m_std > 0 else 2.5
    monotony_penalty = 10.0 if monotony > 2.0 else 0.0

    # ── Consecutive days without rest ──────────────────────────────────────────
    rest_res = await db.execute(
        select(date_col.label("d"))
        .where(UserActivity.user_id == user_id, UserActivity.is_rest_day.is_(True))
        .order_by(date_col.desc())
        .limit(1)
    )
    last_rest_row = rest_res.first()
    if last_rest_row:
        days_since_rest = (today - last_rest_row.d).days
    else:
        act_dates_res = await db.execute(
            select(date_col.label("d"))
            .where(UserActivity.user_id == user_id, UserActivity.is_rest_day.is_(False))
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

    rest_penalty = 20.0 if days_since_rest >= 6 else (10.0 if days_since_rest >= 5 else 0.0)

    tl_score = max(0.0, min(100.0, acwr_score - monotony_penalty - rest_penalty))

    parts = [f"ACWR {acwr:.2f}"]
    if insufficient:
        parts.append("insufficient history")
    if monotony > 2.0:
        parts.append("high monotony")
    if days_since_rest >= 5:
        parts.append(f"{days_since_rest}d without rest")

    return tl_score, " · ".join(parts)


# ── Component 3: Nutritional Recovery ─────────────────────────────────────────

async def _compute_nutrition(
    user_id: UUID, user: User | None, today: date, yesterday: date, db: AsyncSession
) -> tuple[float | None, str]:
    yesterday_start = datetime.combine(yesterday, datetime.min.time())
    today_start = datetime.combine(today, datetime.min.time())

    meals_res = await db.execute(
        select(NutritionLog).where(
            NutritionLog.user_id == user_id,
            NutritionLog.logged_at >= yesterday_start,
            NutritionLog.logged_at < today_start,
        )
    )
    meals = meals_res.scalars().all()
    if not meals:
        return None, ""

    total_cals = sum(m.calories or 0 for m in meals)
    total_protein = sum(m.protein_g or 0 for m in meals)

    weight_kg = user.weight_kg if user and user.weight_kg else None
    calorie_target = user.daily_calorie_target if user else None

    # Protein adequacy (1.6g/kg/day — minimum recovery dose)
    if weight_kg:
        protein_target = weight_kg * 1.6
    elif calorie_target:
        protein_target = calorie_target * 0.30 / 4
    else:
        protein_target = None

    if protein_target and protein_target > 0:
        p_ratio = total_protein / protein_target
        if p_ratio >= 1.0:
            protein_score = 100.0
        elif p_ratio >= 0.75:
            protein_score = 75.0
        elif p_ratio >= 0.50:
            protein_score = 40.0
        else:
            protein_score = 10.0
    else:
        protein_score = 75.0  # no target available — neutral

    # Caloric adequacy
    date_col = cast(UserActivity.logged_at, Date)
    yest_sess_res = await db.execute(
        select(UserActivity).where(
            UserActivity.user_id == user_id,
            date_col == yesterday,
            UserActivity.is_rest_day.is_(False),
        )
    )
    yest_sessions = yest_sess_res.scalars().all()
    had_session = len(yest_sessions) > 0
    yest_load = sum(s.training_load or 0 for s in yest_sessions)

    if calorie_target:
        adjusted_target = calorie_target * 1.10 if had_session and yest_load > 200 else calorie_target
        c_ratio = total_cals / adjusted_target
        if 0.90 <= c_ratio <= 1.15:
            calorie_score = 100.0
        elif c_ratio > 1.15:
            calorie_score = 85.0
        elif c_ratio >= 0.75:
            calorie_score = 70.0
        elif c_ratio >= 0.60:
            calorie_score = 40.0
        else:
            calorie_score = 10.0
    else:
        calorie_score = 75.0

    # Post-workout nutrition timing penalty
    timing_penalty = 0.0
    if had_session and yest_sessions:
        last_session_time = max(s.logged_at for s in yest_sessions)
        two_hours_after = last_session_time + timedelta(hours=2)
        post_meal_exists = any(
            last_session_time <= m.logged_at <= two_hours_after for m in meals
        )
        if not post_meal_exists:
            timing_penalty = 10.0

    nutr_score = max(0.0, min(100.0, protein_score * 0.60 + calorie_score * 0.40 - timing_penalty))

    parts = [f"{round(total_cals)} kcal yesterday"]
    if protein_target:
        parts.append(f"{round(total_protein)}g protein (target {round(protein_target)}g)")
    return round(nutr_score), " · ".join(parts)


# ── Component 4: Sleep Score ───────────────────────────────────────────────────

async def _compute_sleep(
    user_id: UUID, yesterday: date, db: AsyncSession
) -> tuple[float | None, str]:
    """Sleep score from Apple HealthKit. Excluded if no data. Never estimated."""
    res = await db.execute(
        select(HealthSnapshot).where(
            HealthSnapshot.user_id == user_id,
            HealthSnapshot.date == yesterday,
        )
    )
    snap = res.scalar_one_or_none()
    if snap is None or snap.sleep_duration_hours is None:
        return None, ""

    hours = snap.sleep_duration_hours

    # Duration score (Walker/Mah sleep research)
    if hours < 5:
        duration_score = 10.0
    elif hours < 6:
        duration_score = 30.0
    elif hours < 7:
        duration_score = 55.0
    elif hours < 8:
        duration_score = 85.0
    elif hours <= 9:
        duration_score = 100.0
    else:
        duration_score = 90.0  # excessive sleep can indicate overtraining/illness

    # Bedtime consistency: no bedtime field yet → no penalty
    consistency_penalty = 0.0

    sleep_score = max(0.0, min(100.0, duration_score - consistency_penalty))
    return round(sleep_score), f"{hours:.1f}h sleep (Apple Health)"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _redistribute_weights(available_keys: list[str]) -> dict[str, float]:
    total = sum(_DEFAULT_WEIGHTS[k] for k in available_keys)
    return {k: _DEFAULT_WEIGHTS[k] / total for k in available_keys}


def _score_to_label_color(score: int) -> tuple[str, str]:
    if score >= 85:
        return "Optimal", "green"
    if score >= 70:
        return "Good to Train", "green"
    if score >= 55:
        return "Train with Caution", "amber"
    if score >= 40:
        return "Light Activity Only", "amber"
    return "Rest Recommended", "red"


def _factor_text(key: str, score: float) -> str:
    if key == "hooper":
        if score < 40:
            return "High fatigue or soreness reported this morning — consider a light session or rest"
        return "Wellness check-in indicates elevated stress or soreness today"
    if key == "training_load":
        if score < 40:
            return "Your training load has been very high relative to your recent average"
        return "Training load or monotony is elevated — recovery work recommended"
    if key == "nutrition":
        return "Protein intake or caloric fueling yesterday was below your recovery target"
    if key == "sleep":
        if score < 40:
            return "Sleep last night was critically short — recovery is compromised today"
        return "Sleep duration last night was below the optimal 7–9 hour window"
    return "Recovery metrics indicate reduced readiness today"


async def _get_hardware_status(user_id: UUID, yesterday: date, db: AsyncSession) -> dict:
    res = await db.execute(
        select(HealthSnapshot).where(
            HealthSnapshot.user_id == user_id,
            HealthSnapshot.date == yesterday,
        )
    )
    snap = res.scalar_one_or_none()
    sleep_available = snap is not None and snap.sleep_duration_hours is not None
    hrv_available = snap is not None and snap.hrv_ms is not None

    return {
        "apple_watch": sleep_available,
        "whoop": False,
        "oura": False,
        "hrv_available": hrv_available,
        "sleep_available": sleep_available,
    }


async def _save_cache(user_id: UUID, result: dict, db: AsyncSession) -> None:
    stmt = pg_insert(ReadinessCache).values(
        user_id=user_id,
        score=result["score"],
        label=result["label"],
        color=result["color"],
        primary_factor=result["primary_factor"],
        data_confidence=result["data_confidence"],
        components_used=result["components_used"],
        breakdown=result["breakdown"],
        hardware_available=result["hardware_available"],
        calculated_at=datetime.utcnow(),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={
            "score": stmt.excluded.score,
            "label": stmt.excluded.label,
            "color": stmt.excluded.color,
            "primary_factor": stmt.excluded.primary_factor,
            "data_confidence": stmt.excluded.data_confidence,
            "components_used": stmt.excluded.components_used,
            "breakdown": stmt.excluded.breakdown,
            "hardware_available": stmt.excluded.hardware_available,
            "calculated_at": stmt.excluded.calculated_at,
        },
    )
    await db.execute(stmt)
    await db.commit()
