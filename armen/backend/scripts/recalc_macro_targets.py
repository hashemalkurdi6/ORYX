"""Backfill nutrition_targets and users.daily_calorie_target for existing users.

Why this exists: prior to the calorie-target-inconsistency fix, the value
persisted on `users.daily_calorie_target` was whatever the mobile signup flow
posted, computed with an additive goal adjustment. The backend formula uses
a multiplicative goal multiplier and is the new single source of truth (see
docs/bugs/calorie-target-inconsistency.md). This script walks every onboarded
user and reruns nutrition_service.calculate_macro_targets so both columns
match the canonical formula.

Idempotent — running it twice is a no-op for any user whose stored value is
already what the formula produces.

Invocation:
    cd armen/backend
    source .venv/bin/activate
    python scripts/recalc_macro_targets.py            # dry run, prints diffs
    python scripts/recalc_macro_targets.py --apply    # commit the recalculation
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.nutrition_service import (  # noqa: E402
    calculate_macro_targets,
    get_cached_targets,
)


def _has_full_macro_inputs(user: User) -> bool:
    return bool(
        user.weight_kg
        and user.height_cm
        and user.age
        and user.biological_sex
        and user.weekly_training_days
        and user.primary_goal
    )


class _Rollback(Exception):
    """Sentinel used to bail out of a SAVEPOINT during dry runs."""


async def run(apply: bool) -> int:
    changed = 0
    matched = 0
    skipped = 0
    async with AsyncSessionLocal() as session:
        users = (await session.execute(select(User))).scalars().all()
        for user in users:
            if not _has_full_macro_inputs(user):
                skipped += 1
                continue

            existing = await get_cached_targets(user.id, session)
            existing_cal = (existing or {}).get("daily_calorie_target")

            if apply:
                new = await calculate_macro_targets(user.id, session)
            else:
                # Dry run — compute inside a SAVEPOINT and roll back so the
                # write doesn't persist. Per-user nesting keeps state clean
                # if any single recalc raises.
                try:
                    async with session.begin_nested():
                        new = await calculate_macro_targets(user.id, session)
                        raise _Rollback()
                except _Rollback:
                    pass

            new_cal = new.get("daily_calorie_target")
            if existing_cal != new_cal:
                verb = "->" if apply else "would change to"
                print(
                    f"  user {user.id}  {user.email}  "
                    f"{existing_cal or '(none)'} {verb} {new_cal}"
                )
                changed += 1
            else:
                matched += 1

        if apply:
            await session.commit()
        else:
            await session.rollback()

    total = changed + matched + skipped
    print(
        f"\nProcessed {total} users: "
        f"{changed} {'changed' if apply else 'would change'}, "
        f"{matched} already correct, "
        f"{skipped} skipped (incomplete onboarding)."
    )
    if not apply:
        print("Dry run — pass --apply to commit.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="commit changes")
    args = parser.parse_args()
    return asyncio.run(run(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
