# ORYX – Food Search Service
# Queries Open Food Facts (no key) and USDA FoodData Central (optional key).
# Caches individual food items and full search queries in PostgreSQL.

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.food import CustomFood, FoodCache, SearchCache
from app.models.nutrition import NutritionLog
from app.schemas.food import CustomFoodIn, FoodItem

logger = logging.getLogger(__name__)

# ── External API URLs ──────────────────────────────────────────────────────────

OFF_SEARCH_URL  = "https://world.openfoodfacts.org/cgi/search.pl"
# v0 API returns {"status": 1, "product": {...}} — v2 returns {"status": "success", ...}
# We use v0 so the integer status check below works correctly.
OFF_BARCODE_URL = "https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

CACHE_TTL_HOURS = 24
HTTP_TIMEOUT    = 10.0

# USDA nutrient IDs we care about
_USDA_NUTRIENTS = {
    1008: "calories_100g",
    1003: "protein_100g",
    1005: "carbs_100g",
    1004: "fat_100g",
    1079: "fibre_100g",
    2000: "sugar_100g",
    1093: "sodium_mg",   # converted → g below
}


# ── Parsers ────────────────────────────────────────────────────────────────────

def _parse_off_product(product: dict) -> FoodItem | None:
    """Parse a single Open Food Facts product dict into a FoodItem."""
    name = (product.get("product_name") or "").strip()
    if not name:
        return None
    n = product.get("nutriments", {})

    def _f(key: str) -> float:
        v = n.get(key) or n.get(key.replace("_100g", ""))
        try:
            return round(float(v), 2) if v is not None else 0.0
        except (TypeError, ValueError):
            return 0.0

    # Parse serving size string like "15g" or "1 tbsp (15g)"
    raw_serving = product.get("serving_size") or ""
    serving_g: float | None = None
    serving_unit: str | None = None
    if raw_serving:
        import re
        m = re.search(r"(\d+\.?\d*)\s*g", raw_serving, re.IGNORECASE)
        if m:
            serving_g = float(m.group(1))
        serving_unit = raw_serving

    return FoodItem(
        id=product.get("code") or product.get("id") or str(uuid.uuid4()),
        name=name,
        brand=(product.get("brands") or "").strip() or None,
        source="openfoodfacts",
        calories_100g=_f("energy-kcal_100g"),
        protein_100g=_f("proteins_100g"),
        carbs_100g=_f("carbohydrates_100g"),
        fat_100g=_f("fat_100g"),
        fibre_100g=_f("fiber_100g"),
        sugar_100g=_f("sugars_100g"),
        sodium_100g=round(_f("sodium_100g"), 4),
        serving_size_g=serving_g,
        serving_unit=serving_unit,
    )


def _parse_usda_food(food: dict) -> FoodItem | None:
    """Parse a USDA FoodData Central food dict into a FoodItem."""
    name = (food.get("description") or "").strip()
    if not name:
        return None

    nutrients: dict[str, float] = {}
    for nutrient_entry in food.get("foodNutrients", []):
        nid = nutrient_entry.get("nutrientId")
        val = nutrient_entry.get("value")
        if nid in _USDA_NUTRIENTS and val is not None:
            try:
                nutrients[_USDA_NUTRIENTS[nid]] = round(float(val), 2)
            except (TypeError, ValueError):
                pass

    # Sodium comes in mg → convert to g
    sodium_g = round(nutrients.pop("sodium_mg", 0.0) / 1000, 4)

    serving_g: float | None = food.get("servingSize")
    serving_unit: str | None = food.get("servingSizeUnit")

    brand = (food.get("brandOwner") or food.get("brandName") or "").strip() or None

    return FoodItem(
        id=f"usda_{food.get('fdcId', uuid.uuid4())}",
        name=name,
        brand=brand,
        source="usda",
        calories_100g=nutrients.get("calories_100g", 0.0),
        protein_100g=nutrients.get("protein_100g", 0.0),
        carbs_100g=nutrients.get("carbs_100g", 0.0),
        fat_100g=nutrients.get("fat_100g", 0.0),
        fibre_100g=nutrients.get("fibre_100g", 0.0),
        sugar_100g=nutrients.get("sugar_100g", 0.0),
        sodium_100g=sodium_g,
        serving_size_g=float(serving_g) if serving_g else None,
        serving_unit=serving_unit,
    )


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _query_hash(query: str) -> str:
    return hashlib.sha256(query.strip().lower().encode()).hexdigest()


async def _get_cached_search(query: str, db: AsyncSession) -> list[FoodItem] | None:
    h = _query_hash(query)
    result = await db.execute(select(SearchCache).where(SearchCache.query_hash == h))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    age = datetime.utcnow() - row.cached_at
    if age > timedelta(hours=CACHE_TTL_HOURS):
        await db.delete(row)
        return None
    try:
        return [FoodItem(**item) for item in json.loads(row.results_json)]
    except Exception:
        return None


async def _save_search_cache(query: str, items: list[FoodItem], db: AsyncSession) -> None:
    h = _query_hash(query)
    result = await db.execute(select(SearchCache).where(SearchCache.query_hash == h))
    row = result.scalar_one_or_none()
    data = json.dumps([item.model_dump() for item in items])
    if row:
        row.results_json = data
        row.cached_at = datetime.utcnow()
    else:
        db.add(SearchCache(
            id=uuid.uuid4(),
            query_hash=h,
            query_text=query[:500],
            results_json=data,
        ))


async def _get_cached_barcode(barcode: str, db: AsyncSession) -> FoodItem | None:
    result = await db.execute(
        select(FoodCache).where(FoodCache.external_id == barcode)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    age = datetime.utcnow() - row.cached_at
    if age > timedelta(hours=CACHE_TTL_HOURS * 7):
        return None
    return FoodItem(
        id=row.external_id,
        name=row.food_name,
        brand=row.brand,
        source=row.source,  # type: ignore[arg-type]
        calories_100g=row.calories_100g or 0.0,
        protein_100g=row.protein_100g or 0.0,
        carbs_100g=row.carbs_100g or 0.0,
        fat_100g=row.fat_100g or 0.0,
        fibre_100g=row.fibre_100g or 0.0,
        sugar_100g=row.sugar_100g or 0.0,
        sodium_100g=row.sodium_100g or 0.0,
        serving_size_g=row.serving_size_g,
        serving_unit=row.serving_unit,
    )


async def _save_food_cache(item: FoodItem, db: AsyncSession) -> None:
    result = await db.execute(
        select(FoodCache).where(FoodCache.external_id == item.id)
    )
    row = result.scalar_one_or_none()
    if row:
        row.cached_at = datetime.utcnow()
    else:
        db.add(FoodCache(
            id=uuid.uuid4(),
            external_id=item.id,
            source=item.source,
            food_name=item.name,
            brand=item.brand,
            calories_100g=item.calories_100g,
            protein_100g=item.protein_100g,
            carbs_100g=item.carbs_100g,
            fat_100g=item.fat_100g,
            fibre_100g=item.fibre_100g,
            sugar_100g=item.sugar_100g,
            sodium_100g=item.sodium_100g,
            serving_size_g=item.serving_size_g,
            serving_unit=item.serving_unit,
        ))


# ── External API calls ─────────────────────────────────────────────────────────

async def _search_off(query: str) -> list[FoodItem]:
    """Query Open Food Facts search API."""
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(OFF_SEARCH_URL, params={
                "search_terms": query,
                "json": "1",
                "page_size": "20",
                "fields": "code,product_name,brands,nutriments,serving_size",
            })
            logger.info("[OFF] search=%r status=%s", query, resp.status_code)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("[OFF] search failed for %r: %s", query, exc)
        return []

    products = data.get("products", [])
    logger.info("[OFF] %d products returned for %r", len(products), query)
    items: list[FoodItem] = []
    for product in products:
        item = _parse_off_product(product)
        if item:
            items.append(item)
    logger.info("[OFF] %d valid items parsed for %r", len(items), query)
    return items


async def _search_usda(query: str) -> list[FoodItem]:
    """Query USDA FoodData Central search API (requires API key)."""
    api_key = settings.USDA_API_KEY
    if not api_key:
        logger.warning("[USDA] USDA_API_KEY not set — skipping USDA search")
        return []
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(USDA_SEARCH_URL, params={
                "query": query,
                "api_key": api_key,
                "pageSize": "20",
                # Include Branded so packaged/supermarket foods appear
                "dataType": "Foundation,SR Legacy,Survey (FNDDS),Branded",
            })
            logger.info("[USDA] search=%r status=%s", query, resp.status_code)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("[USDA] search failed for %r: %s", query, exc)
        return []

    foods = data.get("foods", [])
    logger.info("[USDA] %d foods returned for %r", len(foods), query)
    items: list[FoodItem] = []
    for food in foods:
        item = _parse_usda_food(food)
        if item:
            items.append(item)
    logger.info("[USDA] %d valid items parsed for %r", len(items), query)
    return items


async def _barcode_off(barcode: str) -> FoodItem | None:
    """Query Open Food Facts barcode API (v0 — returns integer status)."""
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(OFF_BARCODE_URL.format(barcode=barcode))
            logger.info("[OFF] barcode=%s status=%s", barcode, resp.status_code)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("[OFF] barcode lookup failed for %r: %s", barcode, exc)
        return None

    product_status = data.get("status")
    logger.info("[OFF] barcode=%s product_status=%r", barcode, product_status)
    # v0 API: status=1 means found, status=0 means not found
    if product_status != 1:
        logger.info("[OFF] barcode %s not found in Open Food Facts", barcode)
        return None
    product = data.get("product") or {}
    product["code"] = barcode
    item = _parse_off_product(product)
    logger.info("[OFF] barcode=%s parsed item=%s", barcode, item.name if item else None)
    return item


async def _barcode_usda_fallback(barcode: str) -> FoodItem | None:
    """Try USDA branded foods search using barcode as UPC query."""
    api_key = settings.USDA_API_KEY
    if not api_key:
        return None
    logger.info("[USDA] trying barcode fallback for %s", barcode)
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(USDA_SEARCH_URL, params={
                "query": barcode,
                "api_key": api_key,
                "pageSize": "1",
                "dataType": "Branded",
            })
            resp.raise_for_status()
            data = resp.json()
        foods = data.get("foods", [])
        if foods:
            item = _parse_usda_food(foods[0])
            logger.info("[USDA] barcode fallback found: %s", item.name if item else None)
            return item
    except Exception as exc:
        logger.warning("[USDA] barcode fallback failed for %r: %s", barcode, exc)
    return None


# ── Deduplication ──────────────────────────────────────────────────────────────

def _deduplicate(items: list[FoodItem]) -> list[FoodItem]:
    """Remove near-duplicate entries by (lowercased name, brand) pair."""
    seen: set[tuple[str, str]] = set()
    out: list[FoodItem] = []
    for item in items:
        key = (item.name.lower().strip(), (item.brand or "").lower().strip())
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


# ── Public API ─────────────────────────────────────────────────────────────────

async def search_foods(query: str, db: AsyncSession) -> list[FoodItem]:
    """Search Open Food Facts + USDA, merge, deduplicate, cache, return top 20."""
    query = query.strip()
    if not query:
        return []

    logger.info("[search_foods] query=%r", query)

    # 1. Check search cache
    cached = await _get_cached_search(query, db)
    if cached is not None:
        logger.info("[search_foods] cache hit: %d results", len(cached))
        return cached

    # 2. Parallel external calls
    import asyncio
    off_results, usda_results = await asyncio.gather(
        _search_off(query),
        _search_usda(query),
    )
    logger.info("[search_foods] OFF=%d USDA=%d", len(off_results), len(usda_results))

    # 3. Merge: OFF first (better coverage), USDA for whole/branded foods
    merged = _deduplicate(off_results + usda_results)[:20]
    logger.info("[search_foods] merged=%d after dedup", len(merged))

    # 4. Cache result
    await _save_search_cache(query, merged, db)
    await db.flush()

    return merged


async def lookup_barcode(barcode: str, db: AsyncSession) -> FoodItem | None:
    """Look up a product barcode via Open Food Facts, with USDA fallback and DB caching."""
    logger.info("[lookup_barcode] barcode=%s", barcode)

    # 1. Check DB cache
    cached = await _get_cached_barcode(barcode, db)
    if cached:
        logger.info("[lookup_barcode] cache hit: %s", cached.name)
        return cached

    # 2. Try Open Food Facts first
    item = await _barcode_off(barcode)

    # 3. Fall back to USDA branded foods search
    if item is None:
        logger.info("[lookup_barcode] OFF returned nothing, trying USDA fallback")
        item = await _barcode_usda_fallback(barcode)

    if item is None:
        logger.info("[lookup_barcode] not found in any source for barcode %s", barcode)
        return None

    # 4. Cache it
    await _save_food_cache(item, db)
    await db.flush()
    logger.info("[lookup_barcode] cached and returning: %s", item.name)
    return item


async def get_recent_foods(user_id: str, db: AsyncSession) -> list:
    """Return last 10 unique food names logged by this user."""
    from sqlalchemy import desc
    result = await db.execute(
        select(
            NutritionLog.meal_name,
            NutritionLog.calories,
            NutritionLog.protein_g,
            NutritionLog.carbs_g,
            NutritionLog.fat_g,
            NutritionLog.fibre_g,
            func.max(NutritionLog.logged_at).label("last_logged"),
        )
        .where(NutritionLog.user_id == user_id)
        .group_by(
            NutritionLog.meal_name,
            NutritionLog.calories,
            NutritionLog.protein_g,
            NutritionLog.carbs_g,
            NutritionLog.fat_g,
            NutritionLog.fibre_g,
        )
        .order_by(desc("last_logged"))
        .limit(10)
    )
    rows = result.all()
    return [
        {
            "meal_name": r.meal_name,
            "calories": r.calories,
            "protein_g": r.protein_g,
            "carbs_g": r.carbs_g,
            "fat_g": r.fat_g,
            "fibre_g": r.fibre_g,
            "last_logged": r.last_logged,
        }
        for r in rows
    ]


async def get_frequent_foods(user_id: str, db: AsyncSession) -> list:
    """Return top 10 most frequently logged foods by this user."""
    result = await db.execute(
        select(
            NutritionLog.meal_name,
            NutritionLog.calories,
            NutritionLog.protein_g,
            NutritionLog.carbs_g,
            NutritionLog.fat_g,
            NutritionLog.fibre_g,
            func.count(NutritionLog.id).label("log_count"),
        )
        .where(NutritionLog.user_id == user_id)
        .group_by(
            NutritionLog.meal_name,
            NutritionLog.calories,
            NutritionLog.protein_g,
            NutritionLog.carbs_g,
            NutritionLog.fat_g,
            NutritionLog.fibre_g,
        )
        .order_by(func.count(NutritionLog.id).desc())
        .limit(10)
    )
    rows = result.all()
    return [
        {
            "meal_name": r.meal_name,
            "calories": r.calories,
            "protein_g": r.protein_g,
            "carbs_g": r.carbs_g,
            "fat_g": r.fat_g,
            "fibre_g": r.fibre_g,
            "log_count": r.log_count,
        }
        for r in rows
    ]


async def create_custom_food(user_id: str, data: CustomFoodIn, db: AsyncSession) -> CustomFood:
    food = CustomFood(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        food_name=data.food_name,
        brand=data.brand,
        calories_100g=data.calories_100g,
        protein_100g=data.protein_100g,
        carbs_100g=data.carbs_100g,
        fat_100g=data.fat_100g,
        fibre_100g=data.fibre_100g,
        sugar_100g=data.sugar_100g,
        sodium_100g=data.sodium_100g,
        serving_size_g=data.serving_size_g,
        serving_unit=data.serving_unit,
    )
    db.add(food)
    await db.flush()
    await db.refresh(food)
    return food


async def get_custom_foods(user_id: str, db: AsyncSession) -> list[CustomFood]:
    result = await db.execute(
        select(CustomFood)
        .where(CustomFood.user_id == uuid.UUID(user_id))
        .order_by(CustomFood.created_at.desc())
    )
    return list(result.scalars().all())
