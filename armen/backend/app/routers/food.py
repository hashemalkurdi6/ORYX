# ORYX – Food Database Router
# All endpoints share the /nutrition prefix to fit existing API structure.

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.food import (
    CustomFoodIn,
    CustomFoodOut,
    FoodItem,
    FoodSearchResponse,
    FrequentFoodItem,
    RecentFoodItem,
)
from app.services.food_search_service import (
    create_custom_food,
    get_custom_foods,
    get_frequent_foods,
    get_recent_foods,
    lookup_barcode,
    search_foods,
)

router = APIRouter(prefix="/nutrition", tags=["nutrition-food"])


@router.get("/search", response_model=FoodSearchResponse)
async def search_food_database(
    q: str = Query(..., min_length=1, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Search Open Food Facts + USDA FoodData Central.
    Results are cached in PostgreSQL for 24 hours.
    """
    results = await search_foods(q, db)
    return FoodSearchResponse(query=q, results=results)


@router.get("/barcode/{barcode}", response_model=FoodItem)
async def lookup_food_barcode(
    barcode: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Look up a product by barcode via Open Food Facts.
    Result is cached in PostgreSQL so the same barcode never hits the external API twice.
    """
    item = await lookup_barcode(barcode, db)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found. Try searching by name instead.",
        )
    return item


@router.get("/recent", response_model=list[RecentFoodItem])
async def get_recent(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last 10 unique foods logged by this user."""
    rows = await get_recent_foods(str(current_user.id), db)
    return [RecentFoodItem(**r) for r in rows]


@router.get("/frequent", response_model=list[FrequentFoodItem])
async def get_frequent(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the top 10 most frequently logged foods by this user."""
    rows = await get_frequent_foods(str(current_user.id), db)
    return [FrequentFoodItem(**r) for r in rows]


@router.post(
    "/foods/custom",
    response_model=CustomFoodOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_custom(
    payload: CustomFoodIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom food entry linked to the current user."""
    food = await create_custom_food(str(current_user.id), payload, db)
    return CustomFoodOut(
        id=str(food.id),
        user_id=food.user_id,
        food_name=food.food_name,
        brand=food.brand,
        calories_100g=food.calories_100g or 0.0,
        protein_100g=food.protein_100g or 0.0,
        carbs_100g=food.carbs_100g or 0.0,
        fat_100g=food.fat_100g or 0.0,
        fibre_100g=food.fibre_100g or 0.0,
        sugar_100g=food.sugar_100g or 0.0,
        sodium_100g=food.sodium_100g or 0.0,
        serving_size_g=food.serving_size_g,
        serving_unit=food.serving_unit,
        created_at=food.created_at,
    )


@router.get("/foods/custom", response_model=list[CustomFoodOut])
async def list_custom(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all custom foods created by the current user."""
    foods = await get_custom_foods(str(current_user.id), db)
    return [
        CustomFoodOut(
            id=str(f.id),
            user_id=f.user_id,
            food_name=f.food_name,
            brand=f.brand,
            calories_100g=f.calories_100g or 0.0,
            protein_100g=f.protein_100g or 0.0,
            carbs_100g=f.carbs_100g or 0.0,
            fat_100g=f.fat_100g or 0.0,
            fibre_100g=f.fibre_100g or 0.0,
            sugar_100g=f.sugar_100g or 0.0,
            sodium_100g=f.sodium_100g or 0.0,
            serving_size_g=f.serving_size_g,
            serving_unit=f.serving_unit,
            created_at=f.created_at,
        )
        for f in foods
    ]
