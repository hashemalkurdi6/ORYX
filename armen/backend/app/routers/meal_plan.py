import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from openai import AsyncOpenAI
from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.meal_plan import MealPlan, SavedMeal
from app.models.nutrition import NutritionLog
from app.models.nutrition_profile import NutritionProfile
from app.models.user import User
from app.models.user_activity import UserActivity
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nutrition", tags=["meal-plan"])

# In-memory rate limit: {str(user_id) + "_" + date_str: count}
_assistant_rate: dict[str, int] = {}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_macro_targets(calorie_target: int | None, primary_goal: str | None) -> dict:
    if not calorie_target:
        return {"protein_target": None, "carbs_target": None, "fat_target": None}
    goal = (primary_goal or "").lower()
    if any(k in goal for k in ["muscle", "gain", "bulk", "build", "mass"]):
        p_pct, c_pct, f_pct = 0.30, 0.45, 0.25
    elif any(k in goal for k in ["fat", "loss", "cut", "lose", "weight", "lean"]):
        p_pct, c_pct, f_pct = 0.35, 0.35, 0.30
    elif any(k in goal for k in ["perform", "athlete", "sport", "endurance"]):
        p_pct, c_pct, f_pct = 0.25, 0.55, 0.20
    else:
        p_pct, c_pct, f_pct = 0.25, 0.50, 0.25
    return {
        "protein_target": round(calorie_target * p_pct / 4),
        "carbs_target": round(calorie_target * c_pct / 4),
        "fat_target": round(calorie_target * f_pct / 9),
    }


def _strip_json_fences(s: str) -> str:
    s = re.sub(r"```json", "", s)
    s = re.sub(r"```", "", s)
    return s.strip()


def _is_cheat_day(preference: str | None) -> bool:
    if not preference:
        return False
    today_weekday = datetime.utcnow().weekday()  # 6 = Sunday
    pref = preference.lower()
    if "one day a week" in pref:
        return today_weekday == 6  # Sunday
    return False


_MEAL_PLAN_SYSTEM_PROMPT = (
    "You are an expert sports nutritionist and personal chef. Generate a practical, delicious daily "
    "meal plan for an athlete. The plan must respect all dietary restrictions and allergies absolutely "
    "— these are non-negotiable. Factor in the athlete's training load and recovery state when "
    "determining meal timing, carbohydrate amounts, and total calories. Make meals realistic, simple "
    "to prepare given the cooking skill level and time available, and appropriate for the budget. "
    "Return ONLY a JSON object with no markdown, no code fences, no backticks, no preamble. "
    'The JSON structure must be exactly: {"is_cheat_day": boolean, "cheat_day_note": string_or_null, '
    '"total_calories": number, "total_protein_g": number, "total_carbs_g": number, "total_fat_g": number, '
    '"meals": [{"meal_name": string, "meal_type": "breakfast|lunch|dinner|snack|pre_workout|post_workout", '
    '"time": "HH:MM", "description": string, "ingredients": [string], "prep_time_minutes": number, '
    '"prep_note": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, '
    '"can_meal_prep": boolean}], '
    '"grocery_items": [string], '
    '"nutrition_note": string} '
    'For grocery_items, list every distinct ingredient needed across ALL meals. Each item must include '
    'the quantity needed for a full 7-day week (multiply today\'s usage by 7), formatted as '
    '"Ingredient — quantity with unit (e.g. Chicken breast — 1.5 kg, Oats — 700 g, Olive oil — 250 ml, '
    'Eggs — 14, Bananas — 7). Group by category order: proteins first, then grains, dairy, produce, '
    'fats/oils, condiments. Do not include pantry staples like salt, pepper, or water."'
)


def _build_meal_plan_user_message(
    profile: NutritionProfile | None,
    user: User,
    macro_targets: dict,
    yesterday_load: int,
    acwr: float | None,
    readiness_score: int,
    is_cheat_day: bool,
) -> str:
    lines: list[str] = []

    display_name = (
        user.display_name
        or user.full_name
        or user.username
        or (user.email.split("@")[0] if user.email else "Athlete")
    )
    lines.append(f"Athlete: {display_name}")

    if user.primary_goal:
        lines.append(f"Goal: {user.primary_goal}")
    if user.age:
        lines.append(f"Age: {user.age}")
    if user.biological_sex:
        lines.append(f"Sex: {user.biological_sex}")
    if user.weight_kg:
        lines.append(f"Weight: {user.weight_kg} kg")
    if user.height_cm:
        lines.append(f"Height: {user.height_cm} cm")
    if user.fitness_level:
        lines.append(f"Fitness level: {user.fitness_level}")
    if user.sport_tags:
        tags = user.sport_tags if isinstance(user.sport_tags, list) else [user.sport_tags]
        lines.append(f"Sports: {', '.join(str(t) for t in tags)}")

    lines.append("")
    lines.append("CALORIE & MACRO TARGETS:")
    if user.daily_calorie_target:
        lines.append(f"- Daily calories: {user.daily_calorie_target} kcal")
    else:
        lines.append("- Daily calories: Not specified")
    pt = macro_targets.get("protein_target")
    ct = macro_targets.get("carbs_target")
    ft = macro_targets.get("fat_target")
    lines.append(f"- Protein target: {pt}g" if pt else "- Protein target: Not specified")
    lines.append(f"- Carbs target: {ct}g" if ct else "- Carbs target: Not specified")
    lines.append(f"- Fat target: {ft}g" if ft else "- Fat target: Not specified")

    if profile:
        lines.append("")
        lines.append("DIET PREFERENCES:")
        lines.append(f"- Diet type: {profile.diet_type or 'Not specified'}")
        if profile.allergies:
            allergies = profile.allergies if isinstance(profile.allergies, list) else [profile.allergies]
            lines.append(f"- Allergies / intolerances: {', '.join(str(a) for a in allergies)}")
        else:
            lines.append("- Allergies / intolerances: None")
        if profile.cuisines_liked:
            cuisines = profile.cuisines_liked if isinstance(profile.cuisines_liked, list) else [profile.cuisines_liked]
            lines.append(f"- Cuisines liked: {', '.join(str(c) for c in cuisines)}")
        if profile.foods_loved:
            loved = profile.foods_loved if isinstance(profile.foods_loved, list) else [profile.foods_loved]
            lines.append(f"- Foods loved: {', '.join(str(f) for f in loved)}")
        if profile.foods_disliked:
            disliked = profile.foods_disliked if isinstance(profile.foods_disliked, list) else [profile.foods_disliked]
            lines.append(f"- Foods disliked: {', '.join(str(f) for f in disliked)}")
        elif profile.foods_hated:
            lines.append(f"- Foods disliked: {profile.foods_hated}")
        if profile.nutrition_goal:
            lines.append(f"- Nutrition goal: {profile.nutrition_goal}")
        if profile.strictness_level:
            lines.append(f"- Diet strictness: {profile.strictness_level}")
        if profile.sugar_preference:
            lines.append(f"- Sugar preference: {profile.sugar_preference}")
        if profile.carb_approach:
            lines.append(f"- Carb approach: {profile.carb_approach}")

        lines.append("")
        lines.append("FASTING & MEAL TIMING:")
        lines.append(f"- Intermittent fasting: {profile.intermittent_fasting or 'No'}")
        if profile.fasting_start_time and profile.fasting_end_time:
            lines.append(f"- Fasting window: {profile.fasting_start_time} – {profile.fasting_end_time}")
        lines.append(f"- Meals per day: {profile.meals_per_day or 'Not specified'}")
        lines.append(f"- Eats breakfast: {profile.eats_breakfast or 'Not specified'}")
        if profile.meal_times:
            mt = profile.meal_times if isinstance(profile.meal_times, list) else [profile.meal_times]
            lines.append(f"- Preferred meal times: {', '.join(str(t) for t in mt)}")
        if profile.pre_workout_nutrition:
            lines.append(f"- Pre-workout nutrition: {profile.pre_workout_nutrition}")
        if profile.post_workout_nutrition:
            lines.append(f"- Post-workout nutrition: {profile.post_workout_nutrition}")

        lines.append("")
        lines.append("LIFESTYLE & PRACTICAL CONSTRAINTS:")
        lines.append(f"- Meal prep: {profile.meal_prep or 'Not specified'}")
        lines.append(f"- Cooking skill: {profile.cooking_skill or 'Not specified'}")
        lines.append(f"- Time per meal: {profile.time_per_meal or 'Not specified'}")
        lines.append(f"- Weekly food budget: {profile.weekly_budget or 'Not specified'}")
        lines.append(f"- Kitchen access: {profile.kitchen_access or 'Not specified'}")
        lines.append(f"- Region / cuisine context: {profile.region or 'Not specified'}")
        if profile.cheat_day_preference:
            lines.append(f"- Cheat day preference: {profile.cheat_day_preference}")

    lines.append("")
    lines.append("TRAINING CONTEXT (today):")
    today_weekday_name = datetime.utcnow().strftime("%A")
    lines.append(f"- Day of week: {today_weekday_name}")
    lines.append(f"- Yesterday's training load: {yesterday_load if yesterday_load else 'No training logged'}")
    if acwr is not None:
        lines.append(f"- ACWR (acute:chronic workload ratio): {acwr:.2f}")
    else:
        lines.append("- ACWR: insufficient data")
    lines.append(f"- Readiness score: {readiness_score}/100")
    lines.append(f"- Cheat day today: {'Yes' if is_cheat_day else 'No'}")

    return "\n".join(lines)


# ── Core generation logic ──────────────────────────────────────────────────────

async def _generate_meal_plan(current_user: User, db: AsyncSession) -> dict:
    today = date.today()
    yesterday = today - timedelta(days=1)
    seven_days_ago = today - timedelta(days=7)
    twenty_eight_days_ago = today - timedelta(days=28)
    date_col = cast(UserActivity.logged_at, Date)

    # Load nutrition profile
    profile_res = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()

    # Macro targets
    macro_targets = _compute_macro_targets(current_user.daily_calorie_target, current_user.primary_goal)

    # Yesterday's training load
    yday_load_res = await db.execute(
        select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col == yesterday,
        )
    )
    yesterday_load = int(yday_load_res.scalar() or 0)

    # ACWR: 7-day sum / (28-day sum / 4)
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
    chronic_sum = sum(load_by_day.values())
    chronic_weekly = chronic_sum / 4

    acwr: float | None = None
    if load_by_day and chronic_weekly > 0:
        oldest_day = min(load_by_day.keys())
        if (today - oldest_day).days >= 28:
            acwr = round(acute_load / chronic_weekly, 2)

    # Simple readiness score heuristic for prompt context
    readiness_score = 80
    if yesterday_load > 400:
        readiness_score -= 20
    elif yesterday_load > 200:
        readiness_score -= 10
    if acwr is not None and acwr > 1.3:
        readiness_score = min(readiness_score, 59)
    readiness_score = max(0, min(100, readiness_score))

    # Cheat day
    cheat_day_pref = profile.cheat_day_preference if profile else None
    is_cheat = _is_cheat_day(cheat_day_pref)

    # Build prompts
    user_message = _build_meal_plan_user_message(
        profile=profile,
        user=current_user,
        macro_targets=macro_targets,
        yesterday_load=yesterday_load,
        acwr=acwr,
        readiness_score=readiness_score,
        is_cheat_day=is_cheat,
    )

    openai_key = settings.OPENAI_API_KEY
    if not openai_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI meal planning unavailable — OPENAI_API_KEY not configured.",
        )

    try:
        client = AsyncOpenAI(api_key=openai_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _MEAL_PLAN_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=2000,
        )
        result_text = response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("OpenAI meal plan generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI meal plan generation temporarily unavailable. Try again shortly.",
        )

    cleaned = _strip_json_fences(result_text)
    try:
        plan_data = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Failed to parse meal plan JSON: %s — raw: %s", exc, cleaned[:500])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned malformed meal plan. Please try again.",
        )

    return plan_data


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_nutrition_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's nutrition profile."""
    result = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition profile not found",
        )
    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "cuisines_liked": profile.cuisines_liked,
        "foods_loved": profile.foods_loved,
        "foods_disliked": profile.foods_disliked,
        "foods_hated": profile.foods_hated,
        "diet_type": profile.diet_type,
        "allergies": profile.allergies,
        "nutrition_goal": profile.nutrition_goal,
        "strictness_level": profile.strictness_level,
        "cheat_day_preference": profile.cheat_day_preference,
        "sugar_preference": profile.sugar_preference,
        "carb_approach": profile.carb_approach,
        "intermittent_fasting": profile.intermittent_fasting,
        "fasting_start_time": profile.fasting_start_time,
        "fasting_end_time": profile.fasting_end_time,
        "meals_per_day": profile.meals_per_day,
        "eats_breakfast": profile.eats_breakfast,
        "meal_times": profile.meal_times,
        "pre_workout_nutrition": profile.pre_workout_nutrition,
        "post_workout_nutrition": profile.post_workout_nutrition,
        "meal_prep": profile.meal_prep,
        "cooking_skill": profile.cooking_skill,
        "time_per_meal": profile.time_per_meal,
        "weekly_budget": profile.weekly_budget,
        "kitchen_access": profile.kitchen_access,
        "region": profile.region,
        "nutrition_survey_complete": profile.nutrition_survey_complete,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@router.patch("/profile")
async def upsert_nutrition_profile(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the current user's nutrition profile (upsert)."""
    result = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    now = datetime.utcnow()

    updatable_fields = [
        "cuisines_liked", "foods_loved", "foods_disliked", "foods_hated", "diet_type", "allergies",
        "nutrition_goal", "strictness_level", "cheat_day_preference", "sugar_preference",
        "carb_approach", "intermittent_fasting", "fasting_start_time", "fasting_end_time",
        "meals_per_day", "eats_breakfast", "meal_times", "pre_workout_nutrition",
        "post_workout_nutrition", "meal_prep", "cooking_skill", "time_per_meal",
        "weekly_budget", "kitchen_access", "region", "nutrition_survey_complete",
    ]

    if profile is None:
        profile = NutritionProfile(
            id=uuid.uuid4(),
            user_id=current_user.id,
            created_at=now,
            updated_at=now,
        )
        for field in updatable_fields:
            if field in payload:
                setattr(profile, field, payload[field])
        db.add(profile)
    else:
        for field in updatable_fields:
            if field in payload:
                setattr(profile, field, payload[field])
        profile.updated_at = now

    await db.flush()
    await db.refresh(profile)

    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "cuisines_liked": profile.cuisines_liked,
        "foods_loved": profile.foods_loved,
        "foods_disliked": profile.foods_disliked,
        "foods_hated": profile.foods_hated,
        "diet_type": profile.diet_type,
        "allergies": profile.allergies,
        "nutrition_goal": profile.nutrition_goal,
        "strictness_level": profile.strictness_level,
        "cheat_day_preference": profile.cheat_day_preference,
        "sugar_preference": profile.sugar_preference,
        "carb_approach": profile.carb_approach,
        "intermittent_fasting": profile.intermittent_fasting,
        "fasting_start_time": profile.fasting_start_time,
        "fasting_end_time": profile.fasting_end_time,
        "meals_per_day": profile.meals_per_day,
        "eats_breakfast": profile.eats_breakfast,
        "meal_times": profile.meal_times,
        "pre_workout_nutrition": profile.pre_workout_nutrition,
        "post_workout_nutrition": profile.post_workout_nutrition,
        "meal_prep": profile.meal_prep,
        "cooking_skill": profile.cooking_skill,
        "time_per_meal": profile.time_per_meal,
        "weekly_budget": profile.weekly_budget,
        "kitchen_access": profile.kitchen_access,
        "region": profile.region,
        "nutrition_survey_complete": profile.nutrition_survey_complete,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@router.get("/meal-plan/today")
async def get_or_generate_today_meal_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's meal plan. If none exists, generate and save one."""
    # Require survey completion before generating a plan
    profile_res = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()
    if profile is None or not profile.nutrition_survey_complete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete the nutrition survey before generating a meal plan.",
        )

    today = date.today()

    existing_res = await db.execute(
        select(MealPlan).where(
            MealPlan.user_id == current_user.id,
            MealPlan.date == today,
        ).order_by(MealPlan.generated_at.desc())
    )
    existing = existing_res.scalars().first()

    if existing is not None:
        return {
            "id": str(existing.id),
            "date": existing.date.isoformat(),
            "generated_at": existing.generated_at.isoformat(),
            "regeneration_count": existing.regeneration_count,
            "is_cheat_day": existing.is_cheat_day,
            "total_calories": existing.total_calories,
            "total_protein": existing.total_protein,
            "total_carbs": existing.total_carbs,
            "total_fat": existing.total_fat,
            **(existing.plan_json or {}),
        }

    plan_data = await _generate_meal_plan(current_user=current_user, db=db)
    now = datetime.utcnow()

    entry = MealPlan(
        id=uuid.uuid4(),
        user_id=current_user.id,
        date=today,
        plan_json=plan_data,
        total_calories=plan_data.get("total_calories"),
        total_protein=plan_data.get("total_protein_g"),
        total_carbs=plan_data.get("total_carbs_g"),
        total_fat=plan_data.get("total_fat_g"),
        generated_at=now,
        is_cheat_day=bool(plan_data.get("is_cheat_day", False)),
        regeneration_count=0,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    return {
        "id": str(entry.id),
        "date": entry.date.isoformat(),
        "generated_at": entry.generated_at.isoformat(),
        "regeneration_count": entry.regeneration_count,
        "is_cheat_day": entry.is_cheat_day,
        "total_calories": entry.total_calories,
        "total_protein": entry.total_protein,
        "total_carbs": entry.total_carbs,
        "total_fat": entry.total_fat,
        **plan_data,
    }


@router.post("/meal-plan/regenerate")
async def regenerate_today_meal_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate today's meal plan. Limited to 3 regenerations per day."""
    profile_res = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()
    if profile is None or not profile.nutrition_survey_complete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete the nutrition survey before generating a meal plan.",
        )

    today = date.today()

    existing_res = await db.execute(
        select(MealPlan).where(
            MealPlan.user_id == current_user.id,
            MealPlan.date == today,
        ).order_by(MealPlan.generated_at.desc())
    )
    existing = existing_res.scalars().first()

    if existing is not None and existing.regeneration_count >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily regeneration limit reached (3/day)",
        )

    plan_data = await _generate_meal_plan(current_user=current_user, db=db)
    now = datetime.utcnow()

    if existing is not None:
        existing.plan_json = plan_data
        existing.total_calories = plan_data.get("total_calories")
        existing.total_protein = plan_data.get("total_protein_g")
        existing.total_carbs = plan_data.get("total_carbs_g")
        existing.total_fat = plan_data.get("total_fat_g")
        existing.generated_at = now
        existing.is_cheat_day = bool(plan_data.get("is_cheat_day", False))
        existing.regeneration_count = existing.regeneration_count + 1
        await db.flush()
        await db.refresh(existing)
        entry = existing
    else:
        entry = MealPlan(
            id=uuid.uuid4(),
            user_id=current_user.id,
            date=today,
            plan_json=plan_data,
            total_calories=plan_data.get("total_calories"),
            total_protein=plan_data.get("total_protein_g"),
            total_carbs=plan_data.get("total_carbs_g"),
            total_fat=plan_data.get("total_fat_g"),
            generated_at=now,
            is_cheat_day=bool(plan_data.get("is_cheat_day", False)),
            regeneration_count=1,
        )
        db.add(entry)
        await db.flush()
        await db.refresh(entry)

    return {
        "id": str(entry.id),
        "date": entry.date.isoformat(),
        "generated_at": entry.generated_at.isoformat(),
        "regeneration_count": entry.regeneration_count,
        "is_cheat_day": entry.is_cheat_day,
        "total_calories": entry.total_calories,
        "total_protein": entry.total_protein,
        "total_carbs": entry.total_carbs,
        "total_fat": entry.total_fat,
        **plan_data,
    }


@router.post("/meals/save", status_code=status.HTTP_201_CREATED)
async def save_meal(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a meal to the user's saved meals collection."""
    now = datetime.utcnow()
    meal_name = payload.get("meal_name")
    if not meal_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="meal_name is required",
        )

    entry = SavedMeal(
        id=uuid.uuid4(),
        user_id=current_user.id,
        meal_name=meal_name,
        meal_type=payload.get("meal_type"),
        description=payload.get("description"),
        ingredients=payload.get("ingredients"),
        calories=payload.get("calories"),
        protein_g=payload.get("protein_g"),
        carbs_g=payload.get("carbs_g"),
        fat_g=payload.get("fat_g"),
        prep_time_minutes=payload.get("prep_time_minutes"),
        prep_note=payload.get("prep_note"),
        saved_at=now,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    return {
        "id": str(entry.id),
        "user_id": str(entry.user_id),
        "meal_name": entry.meal_name,
        "meal_type": entry.meal_type,
        "description": entry.description,
        "ingredients": entry.ingredients,
        "calories": entry.calories,
        "protein_g": entry.protein_g,
        "carbs_g": entry.carbs_g,
        "fat_g": entry.fat_g,
        "prep_time_minutes": entry.prep_time_minutes,
        "prep_note": entry.prep_note,
        "saved_at": entry.saved_at.isoformat(),
    }


@router.get("/meals/saved")
async def get_saved_meals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all saved meals for the current user, newest first."""
    result = await db.execute(
        select(SavedMeal)
        .where(SavedMeal.user_id == current_user.id)
        .order_by(SavedMeal.saved_at.desc())
    )
    meals = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "user_id": str(m.user_id),
            "meal_name": m.meal_name,
            "meal_type": m.meal_type,
            "description": m.description,
            "ingredients": m.ingredients,
            "calories": m.calories,
            "protein_g": m.protein_g,
            "carbs_g": m.carbs_g,
            "fat_g": m.fat_g,
            "prep_time_minutes": m.prep_time_minutes,
            "prep_note": m.prep_note,
            "saved_at": m.saved_at.isoformat(),
        }
        for m in meals
    ]


@router.delete("/meals/saved/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_meal(
    meal_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved meal if it belongs to the current user."""
    result = await db.execute(
        select(SavedMeal).where(
            SavedMeal.id == meal_id,
            SavedMeal.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved meal not found",
        )
    await db.delete(entry)
    await db.flush()


# ── Nutrition Assistant ────────────────────────────────────────────────────────

_ASSISTANT_SYSTEM_PROMPT = (
    "You are ORYX, a knowledgeable and friendly sports nutritionist assistant. "
    "You have full context of this athlete's nutrition profile, dietary restrictions, preferences, "
    "and today's food intake. Answer their nutrition questions in a practical, specific, and "
    "personalized way. Always respect their dietary restrictions and allergies absolutely. "
    "Give concrete suggestions — not vague advice. If they are eating out, suggest specific dishes by name. "
    "If they need a food substitution, suggest something realistic for their region and budget. "
    "If they need to adjust their remaining meals for the day, give specific recommendations based on "
    "how many calories and macros they have left. Keep responses concise — 2–4 sentences maximum "
    "unless a list is genuinely more helpful. Never be preachy. Be direct and practical."
)


@router.post("/assistant")
async def nutrition_assistant(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI nutrition assistant with full user context."""
    user_message: str = payload.get("user_message", "").strip()
    conversation_history: list = payload.get("conversation_history", [])

    if not user_message:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="user_message is required")

    # Rate limit: 20 messages per user per day
    today_str = date.today().isoformat()
    rate_key = f"{current_user.id}_{today_str}"
    current_count = _assistant_rate.get(rate_key, 0)
    if current_count >= 20:
        return {"response_text": "You've reached your daily limit for nutrition questions. Your limit resets tomorrow."}
    _assistant_rate[rate_key] = current_count + 1

    # Load nutrition profile
    profile_res = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()

    # Macro targets
    macro_targets = _compute_macro_targets(current_user.daily_calorie_target, current_user.primary_goal)

    # Today's nutrition logs
    now = datetime.utcnow()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    logs_res = await db.execute(
        select(NutritionLog).where(
            NutritionLog.user_id == current_user.id,
            NutritionLog.logged_at >= start_of_day,
            NutritionLog.logged_at < end_of_day,
        )
    )
    logs = logs_res.scalars().all()
    calories_consumed = sum((l.calories or 0) for l in logs)
    protein_consumed = sum((l.protein_g or 0) for l in logs)
    carbs_consumed = sum((l.carbs_g or 0) for l in logs)
    fat_consumed = sum((l.fat_g or 0) for l in logs)
    meals_logged = ", ".join(l.meal_name for l in logs) if logs else "None yet"

    # Today's meal plan summary
    today = date.today()
    plan_res = await db.execute(
        select(MealPlan).where(
            MealPlan.user_id == current_user.id,
            MealPlan.date == today,
        ).order_by(MealPlan.generated_at.desc())
    )
    plan = plan_res.scalars().first()
    if plan and plan.plan_json:
        plan_meals = plan.plan_json.get("meals", [])
        plan_summary = "; ".join(
            f"{m.get('meal_name', '')} ({m.get('calories', '?')} kcal)"
            for m in plan_meals
        )
    else:
        plan_summary = "No meal plan generated for today"

    # Yesterday's training load + readiness
    yesterday = today - timedelta(days=1)
    date_col = cast(UserActivity.logged_at, Date)
    yday_res = await db.execute(
        select(func.coalesce(func.sum(UserActivity.training_load), 0)).where(
            UserActivity.user_id == current_user.id,
            UserActivity.is_rest_day.is_(False),
            date_col == yesterday,
        )
    )
    yesterday_load = int(yday_res.scalar() or 0)
    readiness = 80
    if yesterday_load > 400:
        readiness -= 20
    elif yesterday_load > 200:
        readiness -= 10

    # Build context
    calorie_target = current_user.daily_calorie_target or 2000
    pt = macro_targets.get("protein_target") or "?"
    ct = macro_targets.get("carbs_target") or "?"
    ft = macro_targets.get("fat_target") or "?"

    context_lines = [
        "Athlete context:",
        f"Diet type: {profile.diet_type if profile else 'Not specified'}",
    ]
    if profile:
        allergies = profile.allergies if isinstance(profile.allergies, list) else ([profile.allergies] if profile.allergies else [])
        context_lines.append(f"Allergies (never suggest these): {', '.join(allergies) if allergies else 'None'}")
        loved = profile.foods_loved if isinstance(profile.foods_loved, list) else []
        disliked = profile.foods_disliked if isinstance(profile.foods_disliked, list) else []
        context_lines.append(f"Foods they love: {', '.join(loved) if loved else 'Not specified'}")
        context_lines.append(f"Foods they dislike: {', '.join(disliked) if disliked else 'Not specified'}")
        context_lines.append(f"Region: {profile.region or 'Not specified'}")
        context_lines.append(f"Goal: {profile.nutrition_goal or 'Not specified'}")
        context_lines.append(f"Strictness: {profile.strictness_level or 'Not specified'}")
    context_lines += [
        "",
        "Today so far:",
        f"Calories consumed: {round(calories_consumed)} of {calorie_target} target",
        f"Protein: {round(protein_consumed)}g of {pt}g",
        f"Carbs: {round(carbs_consumed)}g of {ct}g",
        f"Fat: {round(fat_consumed)}g of {ft}g",
        f"Meals logged: {meals_logged}",
        "",
        f"Today's meal plan: {plan_summary}",
        f"Yesterday's training load: {yesterday_load if yesterday_load else 'None'}",
        f"Readiness score: {readiness}/100",
        "",
        f"Athlete question: {user_message}",
    ]
    full_user_message = "\n".join(context_lines)

    openai_key = settings.OPENAI_API_KEY
    if not openai_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI assistant unavailable.")

    try:
        client = AsyncOpenAI(api_key=openai_key)
        messages: list[dict] = [{"role": "system", "content": _ASSISTANT_SYSTEM_PROMPT}]
        for msg in conversation_history[-5:]:
            role = msg.get("role")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": full_user_message})

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=300,
        )
        result_text = response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("Nutrition assistant OpenAI call failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI assistant temporarily unavailable.")

    return {"response_text": result_text}
