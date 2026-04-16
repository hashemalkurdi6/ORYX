# ORYX
import asyncio
import json
import logging
import re

import anthropic
from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

MODEL = "claude-sonnet-4-20250514"
HAIKU_MODEL = "claude-haiku-4-5-20251001"

_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------

def _format_health_table(health_snapshots: list) -> str:
    """Format health snapshots into a readable table string."""
    if not health_snapshots:
        return "No health data available for the past 7 days."

    lines = ["Date       | Sleep(h) | HRV(ms) | Rest HR | Steps  | Active kcal"]
    lines.append("-" * 70)
    for snap in health_snapshots:
        date_str = str(snap.get("date", "N/A"))
        sleep = f"{snap.get('sleep_duration_hours'):.1f}" if snap.get("sleep_duration_hours") is not None else "N/A"
        hrv = f"{snap.get('hrv_ms'):.1f}" if snap.get("hrv_ms") is not None else "N/A"
        rhr = f"{snap.get('resting_heart_rate'):.0f}" if snap.get("resting_heart_rate") is not None else "N/A"
        steps = str(snap.get("steps")) if snap.get("steps") is not None else "N/A"
        kcal = f"{snap.get('active_energy_kcal'):.0f}" if snap.get("active_energy_kcal") is not None else "N/A"
        lines.append(f"{date_str:<10} | {sleep:<8} | {hrv:<7} | {rhr:<7} | {steps:<6} | {kcal}")
    return "\n".join(lines)


def _format_activities(recent_activities: list) -> str:
    """Format recent activities into a readable list string."""
    if not recent_activities:
        return "No recent workouts recorded."

    lines = []
    for act in recent_activities:
        name = act.get("name", "Unknown")
        sport = act.get("sport_type", "Unknown")
        dist = act.get("distance_meters")
        dist_str = f"{dist / 1000:.2f} km" if dist else "N/A"
        pace = act.get("avg_pace_seconds_per_km")
        if pace:
            pace_min = int(pace // 60)
            pace_sec = int(pace % 60)
            pace_str = f"{pace_min}:{pace_sec:02d} /km"
        else:
            pace_str = "N/A"
        avg_hr = act.get("avg_heart_rate")
        hr_str = f"{avg_hr:.0f} bpm" if avg_hr else "N/A"
        date_str = str(act.get("start_date", "N/A"))[:10]
        lines.append(
            f"- {name} ({sport}) | {dist_str} | Pace: {pace_str} | Avg HR: {hr_str} | Date: {date_str}"
        )
    return "\n".join(lines)


def _format_whoop_table(whoop_data: list) -> str:
    """Format WHOOP recovery records into a readable table."""
    if not whoop_data:
        return "No WHOOP data available."

    lines = ["Date       | Recovery% | HRV(ms) | Rest HR | Sleep%  | Strain"]
    lines.append("-" * 68)
    for rec in whoop_data:
        date_str = str(rec.get("date", "N/A"))
        recovery = f"{rec.get('recovery_score'):.0f}" if rec.get("recovery_score") is not None else "N/A"
        hrv = f"{rec.get('hrv_rmssd'):.1f}" if rec.get("hrv_rmssd") is not None else "N/A"
        rhr = f"{rec.get('resting_heart_rate'):.0f}" if rec.get("resting_heart_rate") is not None else "N/A"
        sleep_pct = f"{rec.get('sleep_performance_pct'):.0f}" if rec.get("sleep_performance_pct") is not None else "N/A"
        strain = f"{rec.get('strain_score'):.1f}" if rec.get("strain_score") is not None else "N/A"
        lines.append(
            f"{date_str:<10} | {recovery:<9} | {hrv:<7} | {rhr:<7} | {sleep_pct:<7} | {strain}"
        )
    return "\n".join(lines)


def _format_oura_table(oura_data: list) -> str:
    """Format Oura daily records into a readable table."""
    if not oura_data:
        return "No Oura data available."

    lines = ["Date       | Readiness | Sleep | HRV(ms) | REM(min) | Deep(min)"]
    lines.append("-" * 68)
    for rec in oura_data:
        date_str = str(rec.get("date", "N/A"))
        readiness = str(rec.get("readiness_score")) if rec.get("readiness_score") is not None else "N/A"
        sleep = str(rec.get("sleep_score")) if rec.get("sleep_score") is not None else "N/A"
        hrv = f"{rec.get('hrv_average'):.1f}" if rec.get("hrv_average") is not None else "N/A"
        rem = str(rec.get("rem_sleep_minutes")) if rec.get("rem_sleep_minutes") is not None else "N/A"
        deep = str(rec.get("deep_sleep_minutes")) if rec.get("deep_sleep_minutes") is not None else "N/A"
        lines.append(
            f"{date_str:<10} | {readiness:<9} | {sleep:<5} | {hrv:<7} | {rem:<8} | {deep}"
        )
    return "\n".join(lines)


def _format_wellness(checkin: dict) -> str:
    """Format a wellness check-in into a readable one-liner."""
    if not checkin:
        return "No wellness check-in recorded today."

    mood = checkin.get("mood", "N/A")
    energy = checkin.get("energy", "N/A")
    soreness = checkin.get("soreness", "N/A")
    result = f"Mood: {mood}/5 | Energy: {energy}/5 | Soreness: {soreness}/5"
    notes = checkin.get("notes")
    if notes:
        result += f"\nNotes: {notes}"
    return result


def _format_nutrition(logs: list) -> str:
    """Format nutrition log entries with macros and totals."""
    if not logs:
        return "No nutrition logged today."

    lines = []
    total_calories = 0
    total_protein = 0.0

    for entry in logs:
        meal = entry.get("meal_name", "Unknown meal")
        cal = entry.get("calories")
        protein = entry.get("protein_g")
        carbs = entry.get("carbs_g")
        fat = entry.get("fat_g")

        parts = [meal]
        macro_parts = []
        if cal is not None:
            macro_parts.append(f"{cal} kcal")
            total_calories += cal
        if protein is not None:
            macro_parts.append(f"P: {protein:.0f}g")
            total_protein += protein
        if carbs is not None:
            macro_parts.append(f"C: {carbs:.0f}g")
        if fat is not None:
            macro_parts.append(f"F: {fat:.0f}g")

        if macro_parts:
            parts.append(f"({', '.join(macro_parts)})")
        lines.append("- " + " ".join(parts))

    lines.append(f"TOTAL: {total_calories} kcal | Protein: {total_protein:.0f}g")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Daily Diagnosis
# ---------------------------------------------------------------------------

def _sync_generate_daily_diagnosis(
    health_snapshots: list,
    recent_activities: list,
    whoop_data: list | None = None,
    oura_data: list | None = None,
    wellness_checkin: dict | None = None,
    nutrition_today: list | None = None,
) -> dict:
    """Synchronous call to Claude for daily diagnosis with all data sources."""
    health_table = _format_health_table(health_snapshots)
    activities_text = _format_activities(recent_activities)

    # Build optional sections only when data is present
    sections = []

    sections.append(f"APPLE HEALTH DATA (last 7 days):\n{health_table}")

    if whoop_data:
        sections.append(f"WHOOP DATA (last 7 days):\n{_format_whoop_table(whoop_data)}")

    if oura_data:
        sections.append(f"OURA RING DATA (last 7 days):\n{_format_oura_table(oura_data)}")

    sections.append(f"RECENT WORKOUTS:\n{activities_text}")

    if wellness_checkin:
        sections.append(f"TODAY'S WELLNESS CHECK-IN:\n{_format_wellness(wellness_checkin)}")

    if nutrition_today:
        sections.append(f"TODAY'S NUTRITION:\n{_format_nutrition(nutrition_today)}")

    data_block = "\n\n".join(sections)

    # Determine which wearable sources are present for cross-reference instruction
    cross_ref_note = ""
    active_sources = ["Apple Health"]
    if whoop_data:
        active_sources.append("WHOOP")
    if oura_data:
        active_sources.append("Oura")
    if len(active_sources) > 1:
        cross_ref_note = (
            f"\nIMPORTANT: The athlete has data from multiple sources: {', '.join(active_sources)}. "
            "Explicitly note when sources AGREE (e.g., 'Both WHOOP and Oura show elevated HRV today, confirming strong recovery') "
            "or CONFLICT (e.g., 'Apple Health shows good sleep but WHOOP recovery is low — possible scoring methodology difference or timing mismatch'). "
            "Cross-referencing multiple data streams adds clinical depth to the diagnosis.\n"
        )

    prompt = f"""You are ORYX, an expert sports science AI. Analyze the following athlete data and provide a concise, plain-English daily performance diagnosis.
{cross_ref_note}
{data_block}

Respond in JSON with exactly these keys:
- "diagnosis": 2-3 sentence plain English explanation of how the athlete's body is performing today and why, referencing specific data points and cross-referencing sources where applicable
- "main_factor": single phrase naming the biggest factor affecting today's performance (e.g., "Poor sleep recovery", "High HRV indicating readiness", "Accumulated training load")
- "recommendation": one specific, actionable recommendation for today (train, rest, easy session, etc.)
- "recovery_score": integer 0-100 representing overall recovery/readiness
- "recovery_color": "green" if score >= 70, "yellow" if 40-69, "red" if < 40

Return only valid JSON, no markdown fences."""

    message = _client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw_text = message.content[0].text.strip()

    # Strip markdown code fences if present
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

    result = json.loads(raw_text)

    # Enforce recovery_color matches score
    score = int(result.get("recovery_score", 50))
    if score >= 70:
        result["recovery_color"] = "green"
    elif score >= 40:
        result["recovery_color"] = "yellow"
    else:
        result["recovery_color"] = "red"
    result["recovery_score"] = score

    return result


async def generate_daily_diagnosis(
    health_snapshots: list,
    recent_activities: list,
    whoop_data: list | None = None,
    oura_data: list | None = None,
    wellness_checkin: dict | None = None,
    nutrition_today: list | None = None,
) -> dict:
    """Async wrapper around the sync Claude call using asyncio.to_thread."""
    return await asyncio.to_thread(
        _sync_generate_daily_diagnosis,
        health_snapshots,
        recent_activities,
        whoop_data,
        oura_data,
        wellness_checkin,
        nutrition_today,
    )


# ---------------------------------------------------------------------------
# Workout Autopsy
# ---------------------------------------------------------------------------

def _sync_generate_workout_autopsy(
    activity: dict,
    pre_activity_health: dict | None,
    pre_activity_whoop: dict | None = None,
    pre_activity_oura: dict | None = None,
    pre_activity_wellness: dict | None = None,
) -> str:
    """Synchronous call to Claude for workout autopsy with all pre-workout context."""
    dist = activity.get("distance_meters")
    dist_str = f"{dist / 1000:.2f} km" if dist else "N/A"
    elapsed = activity.get("elapsed_time_seconds", 0)
    elapsed_str = f"{elapsed // 3600}h {(elapsed % 3600) // 60}m {elapsed % 60}s"
    pace = activity.get("avg_pace_seconds_per_km")
    if pace:
        pace_str = f"{int(pace // 60)}:{int(pace % 60):02d} /km"
    else:
        pace_str = "N/A"
    avg_hr = activity.get("avg_heart_rate")
    max_hr = activity.get("max_heart_rate")
    elevation = activity.get("total_elevation_gain")

    workout_text = f"""Name: {activity.get('name', 'Unknown')}
Sport: {activity.get('sport_type', 'Unknown')}
Distance: {dist_str}
Elapsed Time: {elapsed_str}
Avg Pace: {pace_str}
Avg Heart Rate: {f"{avg_hr:.0f} bpm" if avg_hr else "N/A"}
Max Heart Rate: {f"{max_hr:.0f} bpm" if max_hr else "N/A"}
Total Elevation Gain: {f"{elevation:.0f} m" if elevation else "N/A"}
Date: {str(activity.get('start_date', 'N/A'))[:10]}"""

    # Build pre-workout state section
    pre_sections = []

    if pre_activity_health:
        h = pre_activity_health
        h_sleep = f"{h.get('sleep_duration_hours'):.1f} hours" if h.get("sleep_duration_hours") is not None else "N/A"
        h_hrv = f"{h.get('hrv_ms'):.1f} ms" if h.get("hrv_ms") is not None else "N/A"
        h_rhr = f"{h.get('resting_heart_rate'):.0f} bpm" if h.get("resting_heart_rate") is not None else "N/A"
        h_steps = str(h.get("steps", "N/A"))
        h_kcal = f"{h.get('active_energy_kcal'):.0f} kcal" if h.get("active_energy_kcal") is not None else "N/A"
        health_text = (
            f"Apple Health — Sleep: {h_sleep} | HRV: {h_hrv} | "
            f"Resting HR: {h_rhr} | Steps: {h_steps} | Active Energy: {h_kcal}"
        )
        pre_sections.append(health_text)
    else:
        pre_sections.append("Apple Health — No data available")

    if pre_activity_whoop:
        w = pre_activity_whoop
        w_rec = f"{w.get('recovery_score'):.0f}%" if w.get("recovery_score") is not None else "N/A"
        w_hrv = f"{w.get('hrv_rmssd'):.1f} ms" if w.get("hrv_rmssd") is not None else "N/A"
        w_rhr = f"{w.get('resting_heart_rate'):.0f} bpm" if w.get("resting_heart_rate") is not None else "N/A"
        w_strain = f"{w.get('strain_score'):.1f}" if w.get("strain_score") is not None else "N/A"
        whoop_text = (
            f"WHOOP — Recovery: {w_rec} | HRV: {w_hrv} | "
            f"Resting HR: {w_rhr} | Strain (prev day): {w_strain}"
        )
        pre_sections.append(whoop_text)

    if pre_activity_oura:
        o = pre_activity_oura
        o_hrv = f"{o.get('hrv_average'):.1f} ms" if o.get("hrv_average") is not None else "N/A"
        o_deep = f"{o.get('deep_sleep_minutes')} min" if o.get("deep_sleep_minutes") is not None else "N/A"
        oura_text = (
            f"Oura — Readiness: {o.get('readiness_score', 'N/A')} | "
            f"Sleep Score: {o.get('sleep_score', 'N/A')} | HRV: {o_hrv} | Deep Sleep: {o_deep}"
        )
        pre_sections.append(oura_text)

    if pre_activity_wellness:
        pre_sections.append(f"Wellness Check-in — {_format_wellness(pre_activity_wellness)}")

    pre_state_text = "\n".join(pre_sections)

    # Cross-reference note when multiple sources are present
    source_count = sum([
        pre_activity_health is not None,
        pre_activity_whoop is not None,
        pre_activity_oura is not None,
    ])
    cross_ref_note = ""
    if source_count > 1:
        cross_ref_note = (
            "\nNote: Multiple recovery sources are available. "
            "Cross-reference them — if they agree (e.g., both WHOOP and Oura showed low recovery), "
            "that strengthens the conclusion. If they conflict, acknowledge the discrepancy and reason through it.\n"
        )

    prompt = f"""You are ORYX. Analyze this specific workout and provide a 3-4 sentence "workout autopsy" — a plain English explanation of what the data tells us about this session.

WORKOUT:
{workout_text}

PRE-WORKOUT RECOVERY STATE (day before the activity):
{pre_state_text}
{cross_ref_note}
Explain: effort level relative to heart rate, whether the recovery state going in affected performance, how the body responded, and one key takeaway. Be specific and data-driven. Return only the autopsy text, no JSON."""

    message = _client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text.strip()


async def generate_workout_autopsy(
    activity: dict,
    pre_activity_health: dict | None,
    pre_activity_whoop: dict | None = None,
    pre_activity_oura: dict | None = None,
    pre_activity_wellness: dict | None = None,
) -> str:
    """Async wrapper around the sync Claude call using asyncio.to_thread."""
    return await asyncio.to_thread(
        _sync_generate_workout_autopsy,
        activity,
        pre_activity_health,
        pre_activity_whoop,
        pre_activity_oura,
        pre_activity_wellness,
    )


# ---------------------------------------------------------------------------
# Activity Autopsy (Manual Activities) — Haiku
# ---------------------------------------------------------------------------

def _sync_generate_activity_autopsy(
    activity_type: str,
    duration_minutes: int,
    intensity: str,
    calories: float | None,
    notes: str | None,
    exercise_data: list | None = None,
) -> str:
    """Synchronous call to OpenAI gpt-4o-mini for manual activity autopsy."""
    calories_str = f"~{calories:.0f}" if calories is not None else "unknown"

    if exercise_data:
        exercise_lines = []
        total_volume = 0.0
        for ex in exercise_data:
            ex_name = ex.get("name", "Unknown")
            sets = ex.get("sets", [])
            working_sets = [s for s in sets if s.get("type", "working") == "working" and s.get("completed")]
            set_summary = []
            for s in working_sets:
                w = s.get("weight", "")
                r = s.get("reps", "")
                if w and r:
                    try:
                        total_volume += float(w) * float(r)
                        set_summary.append(f"{r}×{w}kg")
                    except ValueError:
                        pass
            sets_str = ", ".join(set_summary) if set_summary else f"{len(sets)} sets"
            exercise_lines.append(f"- {ex_name}: {sets_str}")
        exercises_text = "\n".join(exercise_lines) if exercise_lines else "No exercises recorded."
        volume_str = f"{total_volume:.0f} kg" if total_volume > 0 else "unknown"
        prompt = (
            f"You are ORYX. Give a 2-3 sentence workout autopsy for this strength session.\n"
            f"Type: {activity_type} | Duration: {duration_minutes} min | Intensity: {intensity} | "
            f"Calories: {calories_str} kcal | Total Volume: {volume_str}\n"
            f"Exercises:\n{exercises_text}\n"
            f"Notes: {notes or 'none'}.\n"
            "Be specific, motivating, and data-driven. Return only the autopsy text, no JSON, no markdown."
        )
    else:
        prompt = (
            f"You are ORYX. Give a 2-3 sentence workout autopsy for: "
            f"{activity_type}, {duration_minutes} minutes, {intensity} intensity, "
            f"{calories_str} kcal burned. "
            f"Notes: {notes or 'none'}. "
            "Be specific, motivating, and data-driven. Return only the autopsy text, no JSON, no markdown."
        )

    logger.info(
        "activity_autopsy: calling OpenAI gpt-4o-mini for %s %dmin %s",
        activity_type, duration_minutes, intensity,
    )
    try:
        response = _openai_client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=256,
            messages=[
                {"role": "system", "content": "You are ORYX, an expert sports science AI assistant."},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:
        logger.exception("activity_autopsy: OpenAI call failed: %s", exc)
        raise

    text = response.choices[0].message.content.strip()
    # Strip any accidental markdown
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    logger.info("activity_autopsy: result=%r", text[:200])
    return text


async def generate_activity_autopsy(
    activity_type: str,
    duration_minutes: int,
    intensity: str,
    calories: float | None,
    notes: str | None,
    exercise_data: list | None = None,
) -> str:
    """Async wrapper around the sync Haiku call using asyncio.to_thread."""
    return await asyncio.to_thread(
        _sync_generate_activity_autopsy,
        activity_type,
        duration_minutes,
        intensity,
        calories,
        notes,
        exercise_data,
    )


# ---------------------------------------------------------------------------
# Hevy Workout Autopsy — Haiku
# ---------------------------------------------------------------------------

def _sync_generate_hevy_autopsy(
    title: str,
    duration_seconds: int | None,
    exercises: list,
    volume_kg: float | None,
) -> str:
    """Synchronous call to OpenAI gpt-4o-mini for Hevy strength session autopsy."""
    exercise_lines = []
    for ex in exercises:
        ex_title = ex.get("title") or ex.get("name", "Unknown")
        sets = ex.get("sets", [])
        exercise_lines.append(f"- {ex_title} ({len(sets)} set{'s' if len(sets) != 1 else ''})")
    exercises_text = "\n".join(exercise_lines) if exercise_lines else "No exercises recorded."

    duration_str = f"{duration_seconds // 60} minutes" if duration_seconds is not None else "unknown duration"
    volume_str = f"{volume_kg:.1f} kg" if volume_kg is not None else "unknown volume"

    prompt = (
        f"You are ORYX. Give a 2-3 sentence autopsy of this strength session.\n"
        f"Workout: {title}\n"
        f"Duration: {duration_str}\n"
        f"Total volume: {volume_str}\n"
        f"Exercises:\n{exercises_text}\n"
        "Be specific, motivating, and data-driven. Return only the autopsy text, no JSON, no markdown."
    )

    logger.info("hevy_autopsy: calling OpenAI gpt-4o-mini for %s", title)
    try:
        response = _openai_client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=256,
            messages=[
                {"role": "system", "content": "You are ORYX, an expert sports science AI assistant."},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as exc:
        logger.exception("hevy_autopsy: OpenAI call failed: %s", exc)
        raise

    text = response.choices[0].message.content.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    logger.info("hevy_autopsy: result=%r", text[:200])
    return text


async def generate_hevy_autopsy(
    title: str,
    duration_seconds: int | None,
    exercises: list,
    volume_kg: float | None,
) -> str:
    """Async wrapper around the sync Haiku call using asyncio.to_thread."""
    return await asyncio.to_thread(
        _sync_generate_hevy_autopsy,
        title,
        duration_seconds,
        exercises,
        volume_kg,
    )


# ---------------------------------------------------------------------------
# Food Photo Scan — Haiku Vision
# ---------------------------------------------------------------------------

FOOD_SCAN_SYSTEM_PROMPT = """You are a nutrition analysis assistant. When given a food image, identify all visible food items and estimate portion sizes based on visual cues like plate size, utensils, and context. Return ONLY a JSON object with no preamble, no markdown, no backticks. The JSON must follow this exact structure:
{
  "food_name": "string",
  "description": "string",
  "serving_estimate": "string",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fibre_g": number,
  "confidence": "low" or "medium" or "high"
}
If you cannot identify the food return the same structure with all numeric values as 0 and confidence as "low"."""


def _sync_scan_food_image(base64_image: str, media_type: str = "image/jpeg") -> dict:
    """Synchronous call to OpenAI vision API to analyze a food photo."""
    # Strip data URI prefix if the frontend included it (e.g. "data:image/jpeg;base64,...")
    if "," in base64_image and base64_image.startswith("data:"):
        _, base64_image = base64_image.split(",", 1)
        logger.info("Stripped data URI prefix from image")

    logger.info(
        "scan_food_image: calling OpenAI gpt-4o-mini, image size=%d bytes (base64), media_type=%s",
        len(base64_image),
        media_type,
    )

    try:
        response = _openai_client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=512,
            messages=[
                {"role": "system", "content": FOOD_SCAN_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{base64_image}",
                                "detail": "low",
                            },
                        },
                        {
                            "type": "text",
                            "text": "Analyze this food photo and return the nutrition JSON.",
                        },
                    ],
                },
            ],
        )
    except Exception as exc:
        logger.exception("scan_food_image: OpenAI API call failed: %s", exc)
        raise

    raw_text = response.choices[0].message.content.strip()
    logger.info("scan_food_image: raw OpenAI response: %r", raw_text[:500])

    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

    try:
        result = json.loads(raw_text)
        logger.info(
            "scan_food_image: parsed result food_name=%r calories=%s confidence=%s",
            result.get("food_name"),
            result.get("calories"),
            result.get("confidence"),
        )
    except json.JSONDecodeError as exc:
        logger.warning("scan_food_image: JSON parse failed (%s), returning fallback. raw=%r", exc, raw_text[:200])
        result = {
            "food_name": "Unknown food",
            "description": "Could not identify the food in this image.",
            "serving_estimate": "Unknown",
            "calories": 0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
            "fibre_g": 0.0,
            "confidence": "low",
        }

    # Enforce valid confidence value
    if result.get("confidence") not in ("low", "medium", "high"):
        result["confidence"] = "low"

    result["low_confidence"] = result.get("confidence") == "low"
    return result


async def scan_food_image(base64_image: str, media_type: str = "image/jpeg") -> dict:
    """Async wrapper for food photo scanning using Claude Haiku vision."""
    return await asyncio.to_thread(_sync_scan_food_image, base64_image, media_type)
