"""
Deload Detector — multi-signal scoring engine.

Analyzes the last 21 days of training, recovery, and wellness data to detect
when an athlete may benefit from a deload week. Uses trend-based detection
across four independent signal categories to avoid false positives.

Scoring philosophy:
  - Each signal returns a 0–100 score (higher = stronger deload signal)
  - Signals are weighted: performance 35%, recovery 35%, wellness 20%, density 10%
  - Only signals with sufficient data are included in the weighted average
  - Recommendation levels: none (<35), consider (35–49), recommended (50–69), urgent (≥70)
  - Confidence degrades when fewer than 2 signals have real data
"""

import asyncio
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user_activity import UserActivity
from app.models.hevy_workout import HevyWorkout
from app.models.health_data import HealthSnapshot
from app.models.wellness import WellnessCheckin
from app.models.whoop_data import WhoopData
from app.models.oura_data import OuraData
from app.schemas.deload import SignalScore, DeloadRecommendation


# ── Constants ─────────────────────────────────────────────────────────────────

# Compound lifts receive 1.5× weight in performance scoring — decline here
# is more meaningful than in an isolation movement.
COMPOUND_KEYWORDS = [
    "squat", "bench", "deadlift", "overhead press", "ohp", "barbell row",
    "bent over row", "pull-up", "pullup", "chin-up", "chinup",
    "power clean", "snatch", "hip thrust", "lunge", "rdl", "romanian",
    "front squat", "press", "incline bench",
]


# ── Pure helpers ──────────────────────────────────────────────────────────────

def _e1rm(weight: float, reps: int) -> float:
    """Epley formula: weight × (1 + reps/30). Returns 0 for invalid inputs."""
    if weight <= 0 or reps <= 0:
        return 0.0
    return weight * (1.0 + reps / 30.0)


def _is_compound(exercise_name: str) -> bool:
    n = exercise_name.lower()
    return any(kw in n for kw in COMPOUND_KEYWORDS)


def _avg(vals: list[float]) -> Optional[float]:
    return sum(vals) / len(vals) if vals else None


def _pct_change(old_val: float, new_val: float) -> float:
    """Returns % change (negative = decline)."""
    if old_val == 0:
        return 0.0
    return ((new_val - old_val) / old_val) * 100.0


def _to_dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day)


# ── Signal 1: Strength / Performance ─────────────────────────────────────────

async def _score_performance(
    db: AsyncSession, user_id: str, today: date
) -> SignalScore:
    """
    Compares average e1RM for each exercise over the recent 7 days vs prior 14
    days. Compound lifts receive extra weight. Requires at least 2 workouts in
    each window to avoid noise from one-off sessions.
    """
    cutoff_21 = _to_dt(today - timedelta(days=21))
    cutoff_7  = _to_dt(today - timedelta(days=7))

    # Fetch Hevy workouts (structured, reliable e1RM source)
    hevy_rows = (await db.execute(
        select(HevyWorkout)
        .where(HevyWorkout.user_id == user_id)
        .where(HevyWorkout.started_at >= cutoff_21)
    )).scalars().all()

    # Fetch manual activities that have exercise data
    manual_rows = (await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == user_id)
        .where(UserActivity.logged_at >= cutoff_21)
        .where(UserActivity.exercise_data.isnot(None))
    )).scalars().all()

    # Build per-exercise e1RM history: {name: [(workout_date, e1rm), ...]}
    history: dict[str, list[tuple[date, float]]] = {}

    for workout in hevy_rows:
        if not workout.exercises:
            continue
        w_date = workout.started_at.date()
        for ex in workout.exercises:
            name = ex.get("title", "Unknown")
            sets = ex.get("sets") or []
            best = max(
                (_e1rm(s.get("weight_kg") or 0, s.get("reps") or 0) for s in sets),
                default=0.0,
            )
            if best > 0:
                history.setdefault(name, []).append((w_date, best))

    for activity in manual_rows:
        if not activity.exercise_data:
            continue
        a_date = activity.logged_at.date()
        for ex in activity.exercise_data:
            name = ex.get("name", "Unknown")
            sets = ex.get("sets") or []
            best = 0.0
            for s in sets:
                # Only count working sets that were completed
                if s.get("type") not in ("working", None):
                    continue
                try:
                    w = float(s.get("weight") or 0)
                    r = int(s.get("reps") or 0)
                    best = max(best, _e1rm(w, r))
                except (ValueError, TypeError):
                    pass
            if best > 0:
                history.setdefault(name, []).append((a_date, best))

    if not history:
        return SignalScore(
            score=0,
            label="Strength Trends",
            explanation="Not enough workout history to detect strength trends yet.",
            data_available=False,
        )

    decline_scores: list[float] = []
    declining_lifts: list[str] = []

    for name, entries in history.items():
        recent = [e for d, e in entries if d >= today - timedelta(days=7)]
        prior  = [e for d, e in entries if d < today - timedelta(days=7)]

        # Require at least 1 session in each window to compare
        if not recent or not prior:
            continue

        avg_recent = _avg(recent)
        avg_prior  = _avg(prior)
        if avg_recent is None or avg_prior is None:
            continue

        pct = _pct_change(avg_prior, avg_recent)

        # Only flag meaningful decline (>3%), ignore noise
        if pct < -3:
            multiplier = 1.5 if _is_compound(name) else 1.0
            score = min(100.0, abs(pct) * multiplier * 2.5)
            decline_scores.append(score)
            declining_lifts.append(f"{name} ({pct:+.0f}%)")

    if not decline_scores:
        return SignalScore(
            score=10,
            label="Strength Trends",
            explanation="No meaningful strength decline detected across your lifts.",
            data_available=True,
        )

    avg_decline = _avg(decline_scores) or 0
    top = declining_lifts[:2]
    explanation = (
        f"Strength declining across {len(decline_scores)} lift(s): "
        + ", ".join(top)
        + ("." if not declining_lifts[2:] else f", and {len(declining_lifts) - 2} more.")
    )
    return SignalScore(
        score=min(100.0, avg_decline),
        label="Strength Trends",
        explanation=explanation,
        data_available=True,
    )


# ── Signal 2: Recovery (HRV, sleep, device scores) ───────────────────────────

async def _score_recovery(
    db: AsyncSession, user_id: str, today: date
) -> SignalScore:
    """
    Checks HRV trend, sleep quality, WHOOP recovery%, and Oura readiness.
    A sustained multi-metric dip is a reliable deload signal.
    """
    cutoff_14 = today - timedelta(days=14)
    cutoff_7  = today - timedelta(days=7)

    snapshots = (await db.execute(
        select(HealthSnapshot)
        .where(HealthSnapshot.user_id == user_id)
        .where(HealthSnapshot.date >= cutoff_14)
    )).scalars().all()

    whoop_rows = (await db.execute(
        select(WhoopData)
        .where(WhoopData.user_id == user_id)
        .where(WhoopData.date >= cutoff_14)
    )).scalars().all()

    oura_rows = (await db.execute(
        select(OuraData)
        .where(OuraData.user_id == user_id)
        .where(OuraData.date >= cutoff_14)
    )).scalars().all()

    if not snapshots and not whoop_rows and not oura_rows:
        return SignalScore(
            score=0,
            label="Recovery Signals",
            explanation="No HRV, sleep, or device data available to assess recovery.",
            data_available=False,
        )

    sub_scores: list[float] = []
    explanations: list[str] = []

    # ── HRV trend (from HealthSnapshot + WHOOP, combined)
    hrv_series: list[tuple[date, float]] = []
    for s in snapshots:
        if s.hrv_ms is not None:
            hrv_series.append((s.date, s.hrv_ms))
    for w in whoop_rows:
        if w.hrv_rmssd is not None:
            hrv_series.append((w.date, w.hrv_rmssd))
    hrv_series.sort(key=lambda x: x[0])

    if len(hrv_series) >= 4:
        recent_hrv = _avg([v for d, v in hrv_series if d >= cutoff_7])
        prior_hrv  = _avg([v for d, v in hrv_series if d < cutoff_7])
        if recent_hrv and prior_hrv:
            pct = _pct_change(prior_hrv, recent_hrv)
            if pct < -10:
                sub_scores.append(min(100.0, abs(pct) * 2.5))
                explanations.append(f"HRV is down {abs(pct):.0f}% vs your recent baseline.")

    # ── Sleep quality trend
    sleep_series: list[tuple[date, float]] = []
    for s in snapshots:
        if s.sleep_quality_score is not None:
            sleep_series.append((s.date, s.sleep_quality_score))
    for w in whoop_rows:
        if w.sleep_performance_pct is not None:
            sleep_series.append((w.date, w.sleep_performance_pct))
    for o in oura_rows:
        if o.sleep_score is not None:
            sleep_series.append((o.date, float(o.sleep_score)))
    sleep_series.sort(key=lambda x: x[0])

    if len(sleep_series) >= 4:
        recent_sl = _avg([v for d, v in sleep_series if d >= cutoff_7])
        prior_sl  = _avg([v for d, v in sleep_series if d < cutoff_7])
        if recent_sl is not None and prior_sl is not None:
            pct = _pct_change(prior_sl, recent_sl)
            if pct < -12 or recent_sl < 55:
                score = max(abs(pct) * 1.8, (55 - recent_sl) * 1.5 if recent_sl < 55 else 0)
                sub_scores.append(min(100.0, score))
                explanations.append(
                    f"Sleep quality averaging {recent_sl:.0f} — notably below your normal."
                )

    # ── WHOOP recovery score (most direct deload signal)
    if whoop_rows:
        recent_whoop = [w.recovery_score for w in whoop_rows
                        if w.recovery_score is not None and w.date >= cutoff_7]
        if recent_whoop:
            avg_rec = _avg(recent_whoop) or 0
            if avg_rec < 40:
                sub_scores.append(min(100.0, (40 - avg_rec) * 2.0))
                explanations.append(f"WHOOP recovery averaging {avg_rec:.0f}% this week.")

    # ── Oura readiness
    if oura_rows:
        recent_oura = [o.readiness_score for o in oura_rows
                       if o.readiness_score is not None and o.date >= cutoff_7]
        if recent_oura:
            avg_ready = _avg(recent_oura) or 0
            if avg_ready < 60:
                sub_scores.append(min(100.0, (60 - avg_ready) * 1.5))
                explanations.append(f"Oura readiness averaging {avg_ready:.0f} this week.")

    if not sub_scores:
        return SignalScore(
            score=15,
            label="Recovery Signals",
            explanation="Recovery metrics look stable across HRV, sleep, and device data.",
            data_available=True,
        )

    return SignalScore(
        score=min(100.0, _avg(sub_scores) or 0),
        label="Recovery Signals",
        explanation=" ".join(explanations[:2]),
        data_available=True,
    )


# ── Signal 3: Subjective wellness (soreness, energy, mood) ───────────────────

async def _score_wellness(
    db: AsyncSession, user_id: str, today: date
) -> SignalScore:
    """
    Sustained high soreness, low energy, or low mood across multiple check-ins
    is a strong subjective deload signal. Requires at least 3 check-ins.
    """
    cutoff_14 = today - timedelta(days=14)
    cutoff_7  = today - timedelta(days=7)

    checkins = (await db.execute(
        select(WellnessCheckin)
        .where(WellnessCheckin.user_id == user_id)
        .where(WellnessCheckin.date >= cutoff_14)
    )).scalars().all()

    if len(checkins) < 3:
        return SignalScore(
            score=0,
            label="Wellness Check-ins",
            explanation="Not enough daily check-ins to detect a wellness trend yet.",
            data_available=False,
        )

    recent = [c for c in checkins if c.date >= cutoff_7]
    prior  = [c for c in checkins if c.date < cutoff_7]

    sub_scores: list[float] = []
    explanations: list[str] = []

    # Soreness: 1 = fresh, 5 = very sore. Threshold for concern: ≥3.5
    if recent:
        avg_soreness = _avg([float(c.soreness) for c in recent]) or 0
        if avg_soreness >= 3.5:
            sub_scores.append(min(100.0, (avg_soreness - 3.0) * 40))
            explanations.append(f"Soreness has been consistently high ({avg_soreness:.1f}/5).")
        elif prior:
            prior_soreness = _avg([float(c.soreness) for c in prior]) or 0
            if avg_soreness > prior_soreness + 0.7:
                sub_scores.append(35)
                explanations.append("Soreness is trending up compared to your baseline.")

    # Energy: 1 = depleted, 5 = strong. Concern threshold: ≤2.5
    if recent:
        avg_energy = _avg([float(c.energy) for c in recent]) or 5
        if avg_energy <= 2.5:
            sub_scores.append(min(100.0, (2.5 - avg_energy) * 50))
            explanations.append(f"Energy levels have been consistently low ({avg_energy:.1f}/5).")

    # Mood: secondary signal, lower weight
    if recent:
        avg_mood = _avg([float(c.mood) for c in recent]) or 5
        if avg_mood <= 2.0:
            sub_scores.append(25)
            if len(explanations) < 2:
                explanations.append(f"Mood has been running low ({avg_mood:.1f}/5).")

    if not sub_scores:
        return SignalScore(
            score=10,
            label="Wellness Check-ins",
            explanation="Soreness, energy, and mood all look within normal range.",
            data_available=True,
        )

    return SignalScore(
        score=min(100.0, _avg(sub_scores) or 0),
        label="Wellness Check-ins",
        explanation=" ".join(explanations[:2]),
        data_available=True,
    )


# ── Signal 4: Training density ────────────────────────────────────────────────

async def _score_training_density(
    db: AsyncSession, user_id: str, today: date
) -> SignalScore:
    """
    Detects accumulated fatigue from too many hard sessions in a row or
    insufficient rest days in the last 7 days.
    """
    cutoff_7 = _to_dt(today - timedelta(days=7))

    manual_rows = (await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == user_id)
        .where(UserActivity.logged_at >= cutoff_7)
    )).scalars().all()

    hevy_rows = (await db.execute(
        select(HevyWorkout)
        .where(HevyWorkout.user_id == user_id)
        .where(HevyWorkout.started_at >= cutoff_7)
    )).scalars().all()

    if not manual_rows and not hevy_rows:
        return SignalScore(
            score=0,
            label="Training Load",
            explanation="No recent training data to evaluate training density.",
            data_available=False,
        )

    # Build a set of "hard training days" in the last 7 days
    hard_days: set[date] = set()
    all_training_days: set[date] = set()

    for act in manual_rows:
        d = act.logged_at.date()
        all_training_days.add(d)
        if act.intensity in ("Hard", "Max"):
            hard_days.add(d)

    for workout in hevy_rows:
        d = workout.started_at.date()
        all_training_days.add(d)
        # Hevy workouts with significant volume count as a hard day
        if workout.volume_kg and workout.volume_kg > 2500:
            hard_days.add(d)
        else:
            # Still a training day, just not necessarily hard
            pass

    sub_scores: list[float] = []
    explanations: list[str] = []

    # Too many hard days in 7 days
    hard_count = len(hard_days)
    if hard_count >= 5:
        sub_scores.append(min(100.0, 50 + (hard_count - 4) * 15))
        explanations.append(f"{hard_count} hard training days in the last 7 — very little recovery time.")
    elif hard_count >= 4:
        sub_scores.append(40)
        explanations.append(f"{hard_count} hard or heavy sessions this week without adequate rest.")

    # Detect consecutive hard days (streak ≥ 3 is a red flag)
    sorted_hard = sorted(hard_days)
    if sorted_hard:
        max_streak = current = 1
        for i in range(1, len(sorted_hard)):
            if (sorted_hard[i] - sorted_hard[i - 1]).days == 1:
                current += 1
                max_streak = max(max_streak, current)
            else:
                current = 1

        if max_streak >= 4:
            sub_scores.append(70)
            explanations.append(f"{max_streak} consecutive hard training days detected.")
        elif max_streak >= 3:
            sub_scores.append(40)
            if not explanations:
                explanations.append(f"{max_streak} hard days in a row with no rest between.")

    if not sub_scores:
        return SignalScore(
            score=5,
            label="Training Load",
            explanation=f"Training distribution looks healthy — {len(all_training_days)} sessions this week.",
            data_available=True,
        )

    return SignalScore(
        score=min(100.0, _avg(sub_scores) or 0),
        label="Training Load",
        explanation=" ".join(explanations[:2]),
        data_available=True,
    )


# ── Main entry point ──────────────────────────────────────────────────────────

async def get_deload_recommendation(
    db: AsyncSession, user_id: str
) -> DeloadRecommendation:
    """
    Runs all four signal analyzers concurrently, then combines their scores
    into a final recommendation. Only signals with real data contribute to the
    weighted average, preventing phantom scores from empty data sources.
    """
    today = date.today()

    # Run all analyzers in parallel — they're independent DB queries
    perf, recovery, wellness, density = await asyncio.gather(
        _score_performance(db, user_id, today),
        _score_recovery(db, user_id, today),
        _score_wellness(db, user_id, today),
        _score_training_density(db, user_id, today),
    )

    signals = [perf, recovery, wellness, density]
    available = [s for s in signals if s.data_available]

    # Confidence is based on how many independent signals have real data
    if len(available) <= 1:
        confidence = "low"
    elif len(available) == 2:
        confidence = "medium"
    else:
        confidence = "high"

    # Weighted average — only count signals that actually have data
    # Weights: performance 35%, recovery 35%, wellness 20%, density 10%
    weights = [0.35, 0.35, 0.20, 0.10]
    weighted_sum = weight_total = 0.0
    for sig, weight in zip(signals, weights):
        if sig.data_available:
            weighted_sum += sig.score * weight
            weight_total += weight

    overall = (weighted_sum / weight_total) if weight_total > 0 else 0.0

    # Recommendation level — suppressed if confidence is low (not enough data)
    if confidence == "low":
        recommendation = "none"
    elif overall >= 70:
        recommendation = "urgent"
    elif overall >= 50:
        recommendation = "recommended"
    elif overall >= 35:
        recommendation = "consider"
    else:
        recommendation = "none"

    # Primary reason: highest-scoring available signal
    top_signal = max(available, key=lambda s: s.score) if available else None
    primary_reason = (
        top_signal.explanation if top_signal
        else "Keep logging workouts and check-ins to get personalized insights."
    )

    return DeloadRecommendation(
        overall_score=round(overall, 1),
        recommendation=recommendation,
        confidence=confidence,
        primary_reason=primary_reason,
        signals=signals,
        suggested_duration_days=7 if overall >= 65 else 5,
        data_days=21,
        analysis_date=today.isoformat(),
    )
