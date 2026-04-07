import asyncio
import json
import re

import anthropic

from app.config import settings

MODEL = "claude-sonnet-4-20250514"

_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _format_health_table(health_snapshots: list) -> str:
    """Format health snapshots into a readable table string."""
    if not health_snapshots:
        return "No health data available for the past 7 days."

    lines = ["Date       | Sleep(h) | HRV(ms) | Rest HR | Steps  | Active kcal"]
    lines.append("-" * 70)
    for snap in health_snapshots:
        date_str = str(snap.get("date", "N/A"))
        sleep = f"{snap.get('sleep_duration_hours', 'N/A'):.1f}" if snap.get("sleep_duration_hours") is not None else "N/A"
        hrv = f"{snap.get('hrv_ms', 'N/A'):.1f}" if snap.get("hrv_ms") is not None else "N/A"
        rhr = f"{snap.get('resting_heart_rate', 'N/A'):.0f}" if snap.get("resting_heart_rate") is not None else "N/A"
        steps = str(snap.get("steps", "N/A")) if snap.get("steps") is not None else "N/A"
        kcal = f"{snap.get('active_energy_kcal', 'N/A'):.0f}" if snap.get("active_energy_kcal") is not None else "N/A"
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


def _sync_generate_daily_diagnosis(health_snapshots: list, recent_activities: list) -> dict:
    """Synchronous call to Claude for daily diagnosis."""
    health_table = _format_health_table(health_snapshots)
    activities_text = _format_activities(recent_activities)

    prompt = f"""You are ARMEN, an expert sports science AI. Analyze the following athlete data and provide a concise, plain-English daily performance diagnosis.

HEALTH DATA (last 7 days):
{health_table}

RECENT WORKOUTS:
{activities_text}

Respond in JSON with exactly these keys:
- "diagnosis": 2-3 sentence plain English explanation of how the athlete's body is performing today and why, referencing specific data points
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

    # Ensure recovery_color matches score if Claude didn't follow rules exactly
    score = int(result.get("recovery_score", 50))
    if score >= 70:
        result["recovery_color"] = "green"
    elif score >= 40:
        result["recovery_color"] = "yellow"
    else:
        result["recovery_color"] = "red"
    result["recovery_score"] = score

    return result


async def generate_daily_diagnosis(health_snapshots: list, recent_activities: list) -> dict:
    """Async wrapper around the sync Claude call using asyncio.to_thread."""
    return await asyncio.to_thread(
        _sync_generate_daily_diagnosis, health_snapshots, recent_activities
    )


def _sync_generate_workout_autopsy(activity: dict, pre_activity_health: dict | None) -> str:
    """Synchronous call to Claude for workout autopsy."""
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

    if pre_activity_health:
        health_text = f"""Sleep Duration: {f"{pre_activity_health.get('sleep_duration_hours'):.1f} hours" if pre_activity_health.get('sleep_duration_hours') is not None else "N/A"}
HRV: {f"{pre_activity_health.get('hrv_ms'):.1f} ms" if pre_activity_health.get('hrv_ms') is not None else "N/A"}
Resting HR: {f"{pre_activity_health.get('resting_heart_rate'):.0f} bpm" if pre_activity_health.get('resting_heart_rate') is not None else "N/A"}
Steps (day before): {pre_activity_health.get('steps', 'N/A')}
Active Energy: {f"{pre_activity_health.get('active_energy_kcal'):.0f} kcal" if pre_activity_health.get('active_energy_kcal') is not None else "N/A"}"""
    else:
        health_text = "No data available"

    prompt = f"""You are ARMEN. Analyze this specific workout and provide a 3-4 sentence "workout autopsy" — a plain English explanation of what the data tells us about this session.

WORKOUT:
{workout_text}

PRE-WORKOUT RECOVERY STATE (day before):
{health_text}

Explain: effort level relative to HR, whether recovery state going in affected performance, how the body responded, and one key takeaway. Be specific and data-driven. Return only the autopsy text, no JSON."""

    message = _client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text.strip()


async def generate_workout_autopsy(activity: dict, pre_activity_health: dict | None) -> str:
    """Async wrapper around the sync Claude call using asyncio.to_thread."""
    return await asyncio.to_thread(
        _sync_generate_workout_autopsy, activity, pre_activity_health
    )
