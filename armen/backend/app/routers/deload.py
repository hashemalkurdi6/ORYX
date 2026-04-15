from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.deload_service import get_deload_recommendation
from app.schemas.deload import DeloadRecommendation

router = APIRouter(prefix="/deload", tags=["deload"])


@router.get("/status", response_model=DeloadRecommendation)
async def get_deload_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze the last 21 days of training, recovery, and wellness data
    and return a deload recommendation with per-signal breakdown.
    """
    return await get_deload_recommendation(db, str(current_user.id))
