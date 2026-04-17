# ORYX — Nutrition service: macro target calculation + daily summary management
import json as json_mod
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ── Targets calculation ────────────────────────────────────────────────────────

async def calculate_macro_targets(user_id: UUID, db: AsyncSession) -> dict:
    """Single source of truth for all macro and micronutrient targets.

    Computes from user body stats (Mifflin-St Jeor) + nutrition profile.
    Upserts into nutrition_targets. Returns targets dict.
    """
    from app.models.nutrition_targets import NutritionTargets
    from app.models.nutrition_profile import NutritionProfile
    from app.models.user import User

    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if user is None:
        return _fallback_targets()

    profile_res = await db.execute(
        select(NutritionProfile).where(NutritionProfile.user_id == user_id)
    )
    profile = profile_res.scalar_one_or_none()

    # STEP 1: TDEE
    calorie_target = _compute_tdee(user)
    if calorie_target and calorie_target != user.daily_calorie_target:
        user.daily_calorie_target = calorie_target
    elif not calorie_target:
        calorie_target = user.daily_calorie_target or 2000

    goal = (user.primary_goal or "").lower()
    diet_type = (profile.diet_type or "").lower() if profile else ""
    carb_approach = (profile.carb_approach or "").lower() if profile else ""
    sugar_pref = (profile.sugar_preference or "") if profile else ""
    strictness = (profile.strictness_level or "").lower() if profile else ""

    is_vegan = "vegan" in diet_type
    weight_kg = user.weight_kg

    # STEP 2: Protein (g/kg bodyweight)
    if any(k in goal for k in ["muscle", "build", "bulk", "gain", "mass"]):
        protein_per_kg = 2.2
    elif any(k in goal for k in ["fat", "loss", "cut", "lose", "lean"]):
        protein_per_kg = 2.0
    elif any(k in goal for k in ["perform", "athlete", "sport", "endurance"]):
        protein_per_kg = 1.8
    else:
        protein_per_kg = 1.6
    if is_vegan:
        protein_per_kg *= 1.10

    if weight_kg:
        protein_g = round(weight_kg * protein_per_kg, 1)
    else:
        protein_g = round(calorie_target * 0.25 / 4, 1)

    # Fat target
    is_keto = any(k in carb_approach for k in ["keto", "ketogenic"])
    is_low_carb = "low carb" in carb_approach or "low-carb" in carb_approach
    is_strict_diet = "strict" in strictness

    if is_keto or is_low_carb:
        fat_pct = 0.40
    elif is_strict_diet:
        fat_pct = 0.20
    else:
        fat_pct = 0.25
    fat_g = round(calorie_target * fat_pct / 9, 1)

    # Carbs: remaining calories
    carbs_g = round((calorie_target - (protein_g * 4) - (fat_g * 9)) / 4, 1)
    carbs_g = max(0.0, carbs_g)

    # Diet-type adjustments
    is_high_carb = "high carb" in carb_approach
    is_carb_cycling = "carb cycl" in carb_approach

    if is_low_carb:
        carbs_g = min(carbs_g, 100.0)
        remaining = calorie_target - (protein_g * 4) - (carbs_g * 4)
        fat_g = round(remaining / 9, 1)
    elif is_high_carb:
        carbs_g = round(calorie_target * 0.55 / 4, 1)
        fat_g = round(calorie_target * 0.20 / 9, 1)

    training_day_carbs_g = None
    rest_day_carbs_g = None
    if is_carb_cycling:
        training_day_carbs_g = round(carbs_g * 1.3, 1)
        rest_day_carbs_g = round(carbs_g * 0.7, 1)

    # STEP 3: Micronutrients
    fibre_g = _compute_fibre(calorie_target, user.biological_sex)
    sugar_max_g = _compute_sugar_target(sugar_pref)

    sex = (user.biological_sex or "").lower()
    is_female = "female" in sex or ("woman" in sex and "man" not in sex)
    is_male = ("male" in sex and "female" not in sex) or ("man" in sex and "woman" not in sex)

    sodium_max_mg = 2300.0
    potassium_mg = 3500.0
    calcium_mg = 1200.0 if (is_vegan or "dairy" in diet_type) else 1000.0
    iron_mg = 18.0 if is_female else 8.0
    if is_vegan:
        iron_mg = round(iron_mg * 1.8, 1)
    vitamin_d_iu = 600.0
    magnesium_mg = 310.0 if is_female else 400.0
    zinc_mg = 8.0 if is_female else 11.0
    omega3_g = 1.1 if is_female else 1.6

    is_if = bool(profile.intermittent_fasting) if profile and profile.intermittent_fasting else False
    water_target_ml = _compute_water_target(user, profile)

    now = datetime.utcnow()
    row = {
        "user_id": user_id,
        "daily_calorie_target": int(calorie_target),
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
        "fibre_g": fibre_g,
        "sugar_max_g": sugar_max_g,
        "sodium_max_mg": sodium_max_mg,
        "potassium_mg": potassium_mg,
        "calcium_mg": calcium_mg,
        "iron_mg": iron_mg,
        "vitamin_d_iu": vitamin_d_iu,
        "magnesium_mg": magnesium_mg,
        "zinc_mg": zinc_mg,
        "omega3_g": omega3_g,
        "is_carb_cycling": is_carb_cycling,
        "training_day_carbs_g": training_day_carbs_g,
        "rest_day_carbs_g": rest_day_carbs_g,
        "is_intermittent_fasting": is_if,
        "water_target_ml": water_target_ml,
        "calculated_at": now,
    }

    stmt = pg_insert(NutritionTargets).values([row])
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id"],
        set_={k: stmt.excluded[k] for k in row if k != "user_id"},
    )
    await db.execute(stmt)
    await db.flush()

    return {k: v for k, v in row.items() if k != "user_id"}


async def get_cached_targets(user_id: UUID, db: AsyncSession) -> dict | None:
    """Return persisted targets from DB, or None if not yet calculated."""
    from app.models.nutrition_targets import NutritionTargets

    res = await db.execute(
        select(NutritionTargets).where(NutritionTargets.user_id == user_id)
    )
    row = res.scalar_one_or_none()
    if row is None:
        return None
    return {
        "daily_calorie_target": row.daily_calorie_target,
        "protein_g": row.protein_g,
        "carbs_g": row.carbs_g,
        "fat_g": row.fat_g,
        "fibre_g": row.fibre_g,
        "sugar_max_g": row.sugar_max_g,
        "sodium_max_mg": row.sodium_max_mg,
        "potassium_mg": row.potassium_mg,
        "calcium_mg": row.calcium_mg,
        "iron_mg": row.iron_mg,
        "vitamin_d_iu": row.vitamin_d_iu,
        "magnesium_mg": row.magnesium_mg,
        "zinc_mg": row.zinc_mg,
        "omega3_g": row.omega3_g,
        "is_carb_cycling": row.is_carb_cycling,
        "training_day_carbs_g": row.training_day_carbs_g,
        "rest_day_carbs_g": row.rest_day_carbs_g,
        "is_intermittent_fasting": row.is_intermittent_fasting,
        "calculated_at": row.calculated_at.isoformat(),
    }


# ── Daily summary ──────────────────────────────────────────────────────────────

async def update_daily_summary(user_id: UUID, log_date: date, db: AsyncSession) -> None:
    """Recompute and upsert daily nutrition totals from all logs for that date."""
    from app.models.daily_nutrition_summary import DailyNutritionSummary
    from app.models.nutrition import NutritionLog

    start = datetime.combine(log_date, datetime.min.time())
    end = start + timedelta(days=1)

    logs_res = await db.execute(
        select(NutritionLog).where(
            NutritionLog.user_id == user_id,
            NutritionLog.logged_at >= start,
            NutritionLog.logged_at < end,
        )
    )
    logs = logs_res.scalars().all()

    summary = {
        "user_id": user_id,
        "date": log_date,
        "calories_consumed": round(sum(l.calories or 0 for l in logs), 1),
        "protein_consumed_g": round(sum(l.protein_g or 0 for l in logs), 1),
        "carbs_consumed_g": round(sum(l.carbs_g or 0 for l in logs), 1),
        "fat_consumed_g": round(sum(l.fat_g or 0 for l in logs), 1),
        "fibre_consumed_g": round(sum(l.fibre_g or 0 for l in logs), 1),
        "sugar_consumed_g": round(sum(l.sugar_g or 0 for l in logs), 1),
        "sodium_consumed_mg": round(sum(l.sodium_mg or 0 for l in logs), 1),
        "vitamin_d_consumed_iu": round(sum(l.vitamin_d_iu or 0 for l in logs), 1),
        "magnesium_consumed_mg": round(sum(l.magnesium_mg or 0 for l in logs), 1),
        "iron_consumed_mg": round(sum(l.iron_mg or 0 for l in logs), 2),
        "calcium_consumed_mg": round(sum(l.calcium_mg or 0 for l in logs), 1),
        "zinc_consumed_mg": round(sum(l.zinc_mg or 0 for l in logs), 2),
        "omega3_consumed_g": round(sum(l.omega3_g or 0 for l in logs), 2),
        "updated_at": datetime.utcnow(),
    }

    stmt = pg_insert(DailyNutritionSummary).values([summary])
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "date"],
        set_={k: stmt.excluded[k] for k in summary if k not in ("user_id", "date")},
    )
    await db.execute(stmt)
    await db.flush()


# ── Meal modification ──────────────────────────────────────────────────────────

async def apply_meal_modification(
    user_id: UUID,
    modification: dict,
    plan: object,  # MealPlan instance
    db: AsyncSession,
) -> tuple[dict | None, dict]:
    """Apply a meal modification to today's plan.

    Returns (updated_meal_or_None, updated_daily_totals).
    """
    plan_json = dict(plan.plan_json or {})  # type: ignore[attr-defined]
    meals = list(plan_json.get("meals", []))

    action = modification.get("action", "")
    meal_type = modification.get("meal_type", "")
    original_item = modification.get("original_item", "")
    replacement_item = modification.get("replacement_item", "")
    reason = modification.get("reason", "")

    updated_meal: dict | None = None

    if action == "replace_meal":
        idx = next(
            (i for i, m in enumerate(meals) if m.get("meal_type") == meal_type), None
        )
        if idx is not None:
            new_meal = await _generate_replacement_meal(
                old_meal=meals[idx],
                replacement_request=replacement_item,
            )
            if new_meal:
                meals[idx] = new_meal
                updated_meal = new_meal

    elif action in ("replace_ingredient", "remove_ingredient", "add_ingredient"):
        idx = next(
            (i for i, m in enumerate(meals) if m.get("meal_type") == meal_type), None
        )
        if idx is not None:
            meal = dict(meals[idx])
            ingredients = list(meal.get("ingredients", []))

            if action == "remove_ingredient":
                ingredients = [
                    ing for ing in ingredients
                    if original_item.lower() not in ing.lower()
                ]
            elif action == "replace_ingredient":
                ingredients = [
                    replacement_item if original_item.lower() in ing.lower() else ing
                    for ing in ingredients
                ]
            elif action == "add_ingredient":
                ingredients.append(replacement_item)

            meal["ingredients"] = ingredients
            meals[idx] = meal
            updated_meal = meal

    # Append to modifications log
    mods = list(plan_json.get("modifications", []))
    mods.append({
        "action": action,
        "meal_type": meal_type,
        "original_item": original_item,
        "replacement_item": replacement_item,
        "reason": reason,
        "timestamp": datetime.utcnow().isoformat(),
    })

    plan_json["meals"] = meals
    plan_json["modifications"] = mods

    total_calories = round(sum(m.get("calories", 0) for m in meals), 1)
    total_protein = round(sum(m.get("protein_g", 0) for m in meals), 1)
    total_carbs = round(sum(m.get("carbs_g", 0) for m in meals), 1)
    total_fat = round(sum(m.get("fat_g", 0) for m in meals), 1)

    plan.plan_json = plan_json  # type: ignore[attr-defined]
    plan.total_calories = total_calories  # type: ignore[attr-defined]
    plan.total_protein = total_protein  # type: ignore[attr-defined]
    plan.total_carbs = total_carbs  # type: ignore[attr-defined]
    plan.total_fat = total_fat  # type: ignore[attr-defined]
    await db.flush()

    return updated_meal, {
        "total_calories": total_calories,
        "total_protein_g": total_protein,
        "total_carbs_g": total_carbs,
        "total_fat_g": total_fat,
    }


async def _generate_replacement_meal(old_meal: dict, replacement_request: str) -> dict | None:
    from app.config import settings
    from openai import AsyncOpenAI

    openai_key = settings.OPENAI_API_KEY
    if not openai_key:
        return None

    prompt = (
        f"You are a sports nutritionist. The user wants to replace this meal:\n"
        f"{json_mod.dumps(old_meal)}\n\n"
        f"Replace it with: '{replacement_request}'. "
        f"Return ONLY a valid JSON object with the exact same keys as the original. "
        f"Match macros as closely as possible. No markdown, no fences."
    )

    try:
        client = AsyncOpenAI(api_key=openai_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
        )
        text = re.sub(r"```json|```", "", response.choices[0].message.content or "").strip()
        return json_mod.loads(text)
    except Exception as exc:
        logger.error("_generate_replacement_meal failed: %s", exc)
        return None


# ── Private helpers ────────────────────────────────────────────────────────────

def _compute_tdee(user: object) -> int | None:
    weight = getattr(user, "weight_kg", None)
    height = getattr(user, "height_cm", None)
    age = getattr(user, "age", None)
    sex = (getattr(user, "biological_sex", None) or "").lower()

    if not (weight and height and age):
        return None

    if "female" in sex or ("woman" in sex and "man" not in sex):
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
    elif "male" in sex and "female" not in sex:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr_m = (10 * weight) + (6.25 * height) - (5 * age) + 5
        bmr_f = (10 * weight) + (6.25 * height) - (5 * age) - 161
        bmr = (bmr_m + bmr_f) / 2

    days_str = (getattr(user, "weekly_training_days", None) or "").lower()
    if "every day" in days_str or "7" in days_str:
        mult = 1.9
    elif any(d in days_str for d in ["5", "6"]):
        mult = 1.725
    elif any(d in days_str for d in ["3", "4"]):
        mult = 1.55
    else:
        mult = 1.375

    goal = (getattr(user, "primary_goal", None) or "").lower()
    if any(k in goal for k in ["fat", "loss", "cut", "lose", "lean"]):
        adj = 0.85
    elif any(k in goal for k in ["muscle", "build", "bulk", "gain", "mass"]):
        adj = 1.10
    elif any(k in goal for k in ["perform", "athlete", "sport", "endurance"]):
        adj = 1.05
    else:
        adj = 1.0

    return int(round(bmr * mult * adj))


def _compute_fibre(calorie_target: int, biological_sex: str | None) -> float:
    base = max(calorie_target * 14 / 1000, 25.0)
    sex = (biological_sex or "").lower()
    if "male" in sex and "female" not in sex:
        base = max(base, 38.0)
    return round(base, 1)


def _compute_sugar_target(sugar_pref: str) -> float:
    pref = sugar_pref.lower() if sugar_pref else ""
    if "avoid" in pref:
        return 0.0
    if "minimiz" in pref or "minimise" in pref:
        return 25.0
    if "natural" in pref:
        return 50.0
    return 75.0


def _compute_water_target(user: object, profile: object | None) -> int:
    """Personalised daily water target in ml, rounded to nearest 100."""
    weight_kg = getattr(user, "weight_kg", None) or 70.0
    base_ml = weight_kg * 35

    # Activity adjustment
    days_str = (getattr(user, "weekly_training_days", None) or "").lower()
    if "every day" in days_str or "7" in days_str:
        activity_adj = 700
    elif any(d in days_str for d in ["5", "6"]):
        activity_adj = 500
    elif any(d in days_str for d in ["3", "4"]):
        activity_adj = 350
    else:
        activity_adj = 0

    # Goal adjustment
    goal = (getattr(user, "primary_goal", None) or "").lower()
    if any(k in goal for k in ["fat", "loss", "cut", "lose", "lean"]):
        goal_adj = 200
    elif any(k in goal for k in ["muscle", "build", "bulk", "gain", "mass"]):
        goal_adj = 300
    elif any(k in goal for k in ["perform", "athlete", "sport", "endurance"]):
        goal_adj = 400
    else:
        goal_adj = 0

    # Climate adjustment — hot regions
    region = (getattr(profile, "region", None) or "").lower() if profile else ""
    _HOT = [
        "middle east", "south asia", "north africa", "southeast asia", "central america",
        "saudi", "uae", "dubai", "qatar", "kuwait", "bahrain", "oman", "jordan", "egypt",
        "india", "pakistan", "bangladesh", "sri lanka", "nepal",
        "malaysia", "thailand", "indonesia", "vietnam", "philippines", "singapore",
        "mexico", "guatemala", "honduras", "el salvador", "nicaragua", "costa rica",
    ]
    climate_adj = 300 if any(r in region for r in _HOT) else 0

    total = base_ml + activity_adj + goal_adj + climate_adj
    return int(round(total / 100) * 100)


def _fallback_targets() -> dict:
    return {
        "daily_calorie_target": 2000,
        "protein_g": 125.0,
        "carbs_g": 225.0,
        "fat_g": 56.0,
        "fibre_g": 28.0,
        "sugar_max_g": 50.0,
        "sodium_max_mg": 2300.0,
        "potassium_mg": 3500.0,
        "calcium_mg": 1000.0,
        "iron_mg": 13.0,
        "vitamin_d_iu": 600.0,
        "magnesium_mg": 355.0,
        "zinc_mg": 9.5,
        "omega3_g": 1.35,
        "is_carb_cycling": False,
        "training_day_carbs_g": None,
        "rest_day_carbs_g": None,
        "is_intermittent_fasting": False,
    }
