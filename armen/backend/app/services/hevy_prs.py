"""Compute personal records across a user's Hevy workout history.

A PR is recorded at the first workout that exceeds all prior workouts on a
per-exercise basis. Three PR kinds are tracked:

  - max_weight : heaviest single set weight at any rep count
  - 1rm        : best Epley-estimated 1RM  (weight * (1 + reps / 30))
  - max_reps   : most reps at a weight >= the previous heaviest working set

Input: workouts sorted chronologically (oldest first).
Output: dict keyed by workout_id → list of PR dicts earned by that workout.
"""

from __future__ import annotations

from typing import Any


def _epley_1rm(weight: float, reps: int) -> float:
    if reps <= 0:
        return 0.0
    return round(weight * (1 + reps / 30.0), 1)


def compute_prs_by_workout(workouts_asc: list[Any]) -> dict[str, list[dict]]:
    """Walk workouts in chronological order, emit PRs earned at each."""
    # per-exercise bests seen so far
    best_weight: dict[str, float] = {}
    best_1rm: dict[str, float] = {}
    best_reps_at_weight: dict[str, tuple[float, int]] = {}  # exercise -> (weight, reps)

    prs_by_wid: dict[str, list[dict]] = {}

    for w in workouts_asc:
        earned: list[dict] = []
        exercises = w.exercises or []
        for ex in exercises:
            name = (ex.get("name") or "").strip()
            if not name:
                continue
            sets = ex.get("sets") or []
            # Evaluate each set against running bests; only record the best earn per exercise.
            top_weight_pr: dict | None = None
            top_1rm_pr: dict | None = None
            top_reps_pr: dict | None = None

            for s in sets:
                try:
                    weight = float(s.get("weight_kg") or s.get("weight") or 0)
                    reps = int(s.get("reps") or 0)
                except (TypeError, ValueError):
                    continue
                if weight <= 0 or reps <= 0:
                    continue

                prev_w = best_weight.get(name, 0.0)
                if weight > prev_w + 1e-6:
                    if top_weight_pr is None or weight > top_weight_pr["value"]:
                        top_weight_pr = {
                            "exercise": name, "kind": "max_weight",
                            "value": round(weight, 2), "unit": "kg",
                            "weight": round(weight, 2), "reps": reps,
                        }

                one_rm = _epley_1rm(weight, reps)
                prev_1rm = best_1rm.get(name, 0.0)
                if one_rm > prev_1rm + 1e-6:
                    if top_1rm_pr is None or one_rm > top_1rm_pr["value"]:
                        top_1rm_pr = {
                            "exercise": name, "kind": "1rm",
                            "value": one_rm, "unit": "kg",
                            "weight": round(weight, 2), "reps": reps,
                        }

                prev_top_weight, prev_top_reps = best_reps_at_weight.get(name, (0.0, 0))
                if weight >= prev_top_weight and reps > prev_top_reps:
                    if top_reps_pr is None or reps > top_reps_pr["value"]:
                        top_reps_pr = {
                            "exercise": name, "kind": "max_reps",
                            "value": float(reps), "unit": "reps",
                            "weight": round(weight, 2), "reps": reps,
                        }

            if top_weight_pr:
                earned.append(top_weight_pr)
                best_weight[name] = max(best_weight.get(name, 0.0), top_weight_pr["value"])
            if top_1rm_pr:
                earned.append(top_1rm_pr)
                best_1rm[name] = max(best_1rm.get(name, 0.0), top_1rm_pr["value"])
            if top_reps_pr:
                earned.append(top_reps_pr)
                best_reps_at_weight[name] = (
                    max(best_reps_at_weight.get(name, (0.0, 0))[0], top_reps_pr["weight"] or 0.0),
                    int(top_reps_pr["value"]),
                )

        if earned:
            prs_by_wid[str(w.id)] = earned

    return prs_by_wid
