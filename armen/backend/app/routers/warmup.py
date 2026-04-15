from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.warmup_service import generate_warmup
from app.schemas.warmup import WarmUpRequest, WarmUpProtocol

router = APIRouter(prefix="/warmup", tags=["warmup"])


@router.post("/generate", response_model=WarmUpProtocol)
async def generate_warmup_route(
    request: WarmUpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a personalised warm-up protocol based on the planned session type,
    target muscle groups, and available readiness signals (sleep, soreness, energy).
    """
    return await generate_warmup(
        muscle_groups=request.muscle_groups,
        session_type=request.session_type,
        sleep_score=request.sleep_score,
        soreness=request.soreness,
        energy=request.energy,
        recent_muscle_work=request.recent_muscle_work,
    )
