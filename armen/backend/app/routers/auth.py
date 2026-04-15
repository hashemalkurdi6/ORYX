import base64
import hashlib
from datetime import datetime, timedelta
from uuid import UUID

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserOut, UserOutInternal, Token, TokenData, UserProfileUpdate, OnboardingUpdate

router = APIRouter(prefix="/auth", tags=["auth"])

security = HTTPBearer()


def _pre_hash(password: str) -> bytes:
    """SHA-256 + base64 → 44 ASCII bytes, safely under bcrypt's 72-byte limit."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pre_hash(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_pre_hash(plain), hashed.encode("utf-8"))


def create_access_token(user_id: UUID) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id_str)
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.id == UUID(token_data.user_id))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def signup(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    if payload.username:
        username_result = await db.execute(select(User).where(User.username == payload.username))
        if username_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken",
            )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        username=payload.username,
        full_name=payload.full_name,
        sports=payload.sports,
        weight_kg=payload.weight_kg,
        display_name=payload.display_name,
        sport_tags=payload.sport_tags,
        primary_goal=payload.primary_goal,
        fitness_level=payload.fitness_level,
        weekly_training_days=payload.weekly_training_days,
        age=payload.age,
        date_of_birth=payload.date_of_birth,
        height_cm=payload.height_cm,
        biological_sex=payload.biological_sex,
        daily_calorie_target=payload.daily_calorie_target,
        preferred_training_time=payload.preferred_training_time,
        onboarding_complete=True,
        current_onboarding_step=12,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.get("/check-username")
async def check_username(username: str, db: AsyncSession = Depends(get_db)):
    """Return whether a username is available (no auth required)."""
    result = await db.execute(select(User).where(User.username == username))
    exists = result.scalar_one_or_none() is not None
    return {"available": not exists}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    internal = UserOutInternal.model_validate(current_user)
    return internal.to_user_out()


@router.put("/profile", response_model=UserOut)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile fields."""
    # If username being changed, check uniqueness (skip if same as current)
    if payload.username and payload.username != current_user.username:
        existing = await db.execute(select(User).where(User.username == payload.username))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already taken")

    if payload.username is not None:
        current_user.username = payload.username
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.bio is not None:
        current_user.bio = payload.bio
    if payload.location is not None:
        current_user.location = payload.location
    if payload.sports is not None:
        current_user.sports = payload.sports

    await db.flush()
    await db.refresh(current_user)
    internal = UserOutInternal.model_validate(current_user)
    return internal.to_user_out()


@router.patch("/me/onboarding", response_model=UserOut)
async def update_onboarding(
    payload: OnboardingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save onboarding progress and, when complete, mark onboarding_complete=True."""
    fields = payload.model_dump(exclude_none=True)
    for field, value in fields.items():
        setattr(current_user, field, value)
    await db.flush()
    await db.refresh(current_user)
    internal = UserOutInternal.model_validate(current_user)
    return internal.to_user_out()


@router.patch("/me/profile", response_model=UserOut)
async def update_profile_patch(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """PATCH current user's profile fields (partial update)."""
    if payload.username and payload.username != current_user.username:
        existing = await db.execute(select(User).where(User.username == payload.username))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already taken")
    fields = payload.model_dump(exclude_none=True)
    for field, value in fields.items():
        setattr(current_user, field, value)
    await db.flush()
    await db.refresh(current_user)
    internal = UserOutInternal.model_validate(current_user)
    return internal.to_user_out()
