# Shared training-load / ACWR helpers used by the dashboard and the
# weekly-load endpoint. Readiness uses a separate EWMA-based ACWR in
# readiness_service.py — intentionally different algorithm.
#
# The audit called out ACWR being computed in three different places with
# subtly different code paths; this module collapses the two flat-window
# variants into one definition.

from __future__ import annotations


def classify_acwr(acwr: float | None) -> str:
    if acwr is None:
        return "insufficient_data"
    if acwr < 0.8:
        return "undertraining"
    if acwr <= 1.3:
        return "optimal"
    if acwr <= 1.5:
        return "caution"
    return "high_risk"


def compute_acwr(
    *,
    acute_load: float,
    chronic_weekly_avg: float,
    has_28_days: bool,
) -> tuple[float | None, str]:
    """Flat-window ACWR: acute (7 days) over chronic weekly average (28/4).

    Returns (acwr, status). When the user doesn't have 28 days of history,
    or chronic_weekly_avg is zero, both fall back to insufficient_data.
    """
    if not has_28_days or chronic_weekly_avg <= 0:
        return None, "insufficient_data"
    acwr = round(acute_load / chronic_weekly_avg, 2)
    return acwr, classify_acwr(acwr)
