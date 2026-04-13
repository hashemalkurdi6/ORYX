# ORYX
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.hevy_workout import HevyWorkout
from app.routers.auth import get_current_user
from app.schemas.hevy import HevyConnectIn, HevySyncResponse, HevyWorkoutOut
from app.services.claude_service import generate_hevy_autopsy

router = APIRouter(prefix="/hevy", tags=["hevy"])

HEVY_API_BASE = "https://api.hevyapp.com"


@router.post("/connect", status_code=status.HTTP_200_OK)
async def connect_hevy(
    payload: HevyConnectIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Store the user's Hevy API key."""
    current_user.hevy_api_key = payload.api_key
    await db.commit()
    return {"connected": True}


@router.post("/sync", response_model=HevySyncResponse)
async def sync_hevy(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch workouts from Hevy API and upsert into the database."""
    if not current_user.hevy_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hevy API key not connected. POST /hevy/connect first.",
        )

    headers = {"api-key": current_user.hevy_api_key}
    all_workouts: list[dict] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        page = 1
        while True:
            resp = await client.get(
                f"{HEVY_API_BASE}/v1/workouts",
                headers=headers,
                params={"page": page, "pageSize": 10},
            )
            if resp.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid Hevy API key.",
                )
            resp.raise_for_status()
            data = resp.json()
            workouts = data.get("workouts", [])
            all_workouts.extend(workouts)
            if page >= data.get("page_count", 1):
                break
            page += 1

    total = len(all_workouts)
    synced = 0

    for w in all_workouts:
        hevy_id = w.get("id", "")

        # Check if already exists
        existing_result = await db.execute(
            select(HevyWorkout).where(HevyWorkout.hevy_workout_id == hevy_id)
        )
        existing = existing_result.scalar_one_or_none()

        # Parse started_at
        start_time_str = w.get("start_time") or w.get("started_at")
        try:
            started_at = datetime.fromisoformat(
                start_time_str.replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except (AttributeError, ValueError):
            started_at = datetime.utcnow()

        # Parse duration from start/end times if not explicit
        duration_seconds: int | None = w.get("duration_seconds")
        if duration_seconds is None:
            end_time_str = w.get("end_time")
            if end_time_str and start_time_str:
                try:
                    end_dt = datetime.fromisoformat(
                        end_time_str.replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                    duration_seconds = int((end_dt - started_at).total_seconds())
                except (ValueError, AttributeError):
                    duration_seconds = None

        # Parse exercises and compute volume
        raw_exercises = w.get("exercises", [])
        exercises: list[dict] = []
        volume_kg = 0.0

        for ex in raw_exercises:
            ex_name = ex.get("title") or ex.get("name", "Unknown")
            sets_data = ex.get("sets", [])
            parsed_sets = []
            for s in sets_data:
                reps = s.get("reps") or 0
                weight = s.get("weight_kg") or 0.0
                parsed_sets.append({"reps": reps, "weight_kg": weight})
                volume_kg += reps * weight
            exercises.append({"name": ex_name, "sets": parsed_sets})

        total_volume = volume_kg if volume_kg > 0 else None

        if existing is None:
            # New workout — insert and generate autopsy
            workout = HevyWorkout(
                user_id=current_user.id,
                hevy_workout_id=hevy_id,
                title=w.get("title", "Untitled Workout"),
                started_at=started_at,
                duration_seconds=duration_seconds,
                exercises=exercises,
                volume_kg=total_volume,
            )
            db.add(workout)
            await db.flush()  # get ID without full commit

            try:
                autopsy = await generate_hevy_autopsy(
                    title=workout.title,
                    duration_seconds=workout.duration_seconds,
                    exercises=exercises,
                    volume_kg=total_volume,
                )
                workout.autopsy_text = autopsy
                workout.autopsy_generated_at = datetime.utcnow()
            except Exception:
                pass

            synced += 1
        else:
            # Update mutable fields
            existing.title = w.get("title", existing.title)
            existing.started_at = started_at
            existing.duration_seconds = duration_seconds
            existing.exercises = exercises
            existing.volume_kg = total_volume

    await db.commit()
    return HevySyncResponse(synced=synced, total=total)


@router.get("/workouts", response_model=list[HevyWorkoutOut])
async def list_hevy_workouts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all Hevy workouts for the current user ordered by started_at DESC."""
    result = await db.execute(
        select(HevyWorkout)
        .where(HevyWorkout.user_id == current_user.id)
        .order_by(HevyWorkout.started_at.desc())
    )
    return result.scalars().all()


@router.delete("/disconnect", status_code=status.HTTP_200_OK)
async def disconnect_hevy(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the user's Hevy API key."""
    current_user.hevy_api_key = None
    await db.commit()
    return {"disconnected": True}
