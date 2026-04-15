"""
Warm-Up Personalizer — Claude Haiku generates contextual warm-up protocols.

The prompt builder encodes all available readiness signals (sleep score,
soreness, energy, recent muscle work) and the planned session type so that
Claude can tailor the warm-up length, mobility emphasis, and ramp-up strategy
accordingly. JSON is validated and returned as a WarmUpProtocol object.
"""

import asyncio
import json
import re
from typing import Optional

from app.services.claude_service import _client, HAIKU_MODEL
from app.schemas.warmup import WarmUpProtocol, WarmUpPhase, WarmUpExercise


# ── System prompt ─────────────────────────────────────────────────────────────

WARMUP_SYSTEM_PROMPT = """You are a certified strength and conditioning coach generating personalised warm-up protocols for athletes. You know how to prepare the body intelligently for different session types and adjust the protocol based on readiness signals.

ALWAYS respond with valid JSON only. No markdown, no explanation, nothing outside the JSON.

Required JSON schema:
{
  "summary": "<1–2 sentences explaining why this warm-up is structured this way>",
  "duration_minutes": <integer>,
  "phases": [
    {
      "phase": "<phase name>",
      "exercises": [
        {
          "name": "<exercise name>",
          "detail": "<sets × reps, duration, or description>",
          "note": "<optional: short reason this was included, e.g. 'Added for hip soreness'>"
        }
      ]
    }
  ]
}

Phase names must be one of: "General Cardio", "Mobility", "Activation", "Ramp-Up Sets"

Rules:
- If sleep score < 65 or soreness >= 4/5: extend mobility, add targeted prep, use more ramp-up increments
- If readiness is high (sleep > 80, soreness ≤ 2, energy ≥ 4): keep it efficient, 8–12 min total
- If a muscle group appears in the sore/recently-trained list: add specific mobility and activation for it
- For strength sessions: always end with Ramp-Up Sets (progressive loading toward working weight)
- For cardio or sport sessions: skip Ramp-Up Sets, focus on dynamic mobility and neuromuscular activation
- Warm-up total: 8 min (high readiness) to 20 min (poor readiness / high soreness)
- Use real exercise names athletes would recognise (e.g. "Banded Clamshells", "World's Greatest Stretch")
- Never include the actual working sets in the warm-up
- Keep notes short and useful, like a coach talking to an athlete"""


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    muscle_groups: list[str],
    session_type: str,
    sleep_score: Optional[float],
    soreness: Optional[int],
    energy: Optional[int],
    recent_muscle_work: dict[str, int],
) -> str:
    lines = [f"Generate a warm-up for: {session_type}"]
    lines.append(f"Target muscle groups: {', '.join(muscle_groups)}")

    # Readiness signals
    if sleep_score is not None:
        lines.append(f"Last night's sleep: {sleep_score:.0f}%")
    if soreness is not None:
        labels = {1: "fresh (1/5)", 2: "mild (2/5)", 3: "moderate (3/5)",
                  4: "high (4/5)", 5: "very high (5/5)"}
        lines.append(f"Reported soreness: {labels.get(soreness, f'{soreness}/5')}")
    if energy is not None:
        labels = {1: "very low (1/5)", 2: "low (2/5)", 3: "moderate (3/5)",
                  4: "good (4/5)", 5: "high (5/5)"}
        lines.append(f"Reported energy: {labels.get(energy, f'{energy}/5')}")

    # Flag muscles trained recently (potential soreness even if not reported)
    sore_muscles = [m for m, days in recent_muscle_work.items() if days <= 2]
    if sore_muscles:
        lines.append(f"Recently trained (may still be sore): {', '.join(sore_muscles)}")

    return "\n".join(lines)


# ── Claude call ───────────────────────────────────────────────────────────────

def _sync_generate(prompt: str) -> dict:
    message = _client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=700,
        system=WARMUP_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if Claude adds them despite instructions
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


async def generate_warmup(
    muscle_groups: list[str],
    session_type: str,
    sleep_score: Optional[float] = None,
    soreness: Optional[int] = None,
    energy: Optional[int] = None,
    recent_muscle_work: Optional[dict] = None,
) -> WarmUpProtocol:
    """
    Async entry point. Builds the prompt, calls Claude Haiku, and returns a
    validated WarmUpProtocol. Falls back to a minimal default if generation fails.
    """
    prompt = _build_prompt(
        muscle_groups=muscle_groups,
        session_type=session_type,
        sleep_score=sleep_score,
        soreness=soreness,
        energy=energy,
        recent_muscle_work=recent_muscle_work or {},
    )

    try:
        raw = await asyncio.to_thread(_sync_generate, prompt)
        phases = [
            WarmUpPhase(
                phase=p["phase"],
                exercises=[
                    WarmUpExercise(
                        name=ex["name"],
                        detail=ex["detail"],
                        note=ex.get("note"),
                    )
                    for ex in p.get("exercises", [])
                ],
            )
            for p in raw.get("phases", [])
        ]
        return WarmUpProtocol(
            summary=raw.get("summary", "Warm-up generated for your session."),
            duration_minutes=int(raw.get("duration_minutes", 12)),
            phases=phases,
        )
    except Exception:
        # Graceful fallback — never crash the app because of a warm-up failure
        return WarmUpProtocol(
            summary="Dynamic warm-up to prepare for your session.",
            duration_minutes=10,
            phases=[
                WarmUpPhase(
                    phase="General Cardio",
                    exercises=[WarmUpExercise(name="Jump Rope / Light Jog", detail="3–5 minutes")],
                ),
                WarmUpPhase(
                    phase="Mobility",
                    exercises=[
                        WarmUpExercise(name="World's Greatest Stretch", detail="5 reps per side"),
                        WarmUpExercise(name="Hip 90/90 Stretch", detail="60 seconds per side"),
                    ],
                ),
                WarmUpPhase(
                    phase="Activation",
                    exercises=[
                        WarmUpExercise(name="Glute Bridges", detail="2 × 15"),
                        WarmUpExercise(name="Band Pull-Aparts", detail="2 × 15"),
                    ],
                ),
            ],
        )
