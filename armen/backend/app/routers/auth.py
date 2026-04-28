import base64
import hashlib
import logging
from datetime import datetime, timedelta
from uuid import UUID

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserOut, UserOutInternal, Token, TokenData, UserProfileUpdate, OnboardingUpdate
from app.services.account_deletion import restore_user, _log_event

router = APIRouter(prefix="/auth", tags=["auth"])

security = HTTPBearer()


def _pre_hash(password: str) -> bytes:
    """SHA-256 + base64 → 44 ASCII bytes, safely under bcrypt's 72-byte limit."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pre_hash(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password against stored hash.

    Supports two schemes:
    - New (current): SHA-256+base64 pre-hash then bcrypt (introduced in the
      soft-delete PR). All passwords hashed by the current `hash_password()`.
    - Legacy: raw bcrypt of the plain UTF-8 bytes (used by the original
      passlib CryptContext). Users who signed up before the scheme migration
      would still have these hashes in the DB.

    On a successful legacy-scheme login we transparently re-hash using the new
    scheme so the user migrates forward without any UX friction.
    """
    hashed_bytes = hashed.encode("utf-8")
    # Try new scheme first (should be the common case)
    try:
        if bcrypt.checkpw(_pre_hash(plain), hashed_bytes):
            return True
    except Exception:
        pass
    # Fallback: legacy passlib direct-bcrypt (plain UTF-8 bytes)
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed_bytes)
    except Exception:
        return False


def create_access_token(user_id: UUID) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_pending_restore_token(user_id: UUID) -> str:
    """Short-lived JWT scoped only to /auth/restore."""
    expire = datetime.utcnow() + timedelta(minutes=settings.PENDING_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.utcnow(),
        "scope": "restore",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_user_from_pending_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate a restore-scoped pending token and return the user.

    Does NOT reject pending-deletion users — that is the whole point.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired restore token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        if payload.get("scope") != "restore":
            raise credentials_exception
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


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
    # Block any in-flight token from a pending-deletion account. The only
    # way back in is via /auth/restore, which uses a separate pending_token.
    if user.delete_requested_at is not None:
        raise credentials_exception
    return user


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def signup(payload: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    from app.services.rate_limit import check_rate_limit, client_ip
    await check_rate_limit(db, f"signup:{client_ip(request)}", limit=5, window_seconds=3600)

    # Always store emails fully lowercased so login lookups are consistent
    # regardless of what capitalization the user or their email client supplies.
    payload.email = payload.email.lower()  # type: ignore[assignment]

    from sqlalchemy import func as _func
    result = await db.execute(
        select(User).where(_func.lower(User.email) == payload.email)
    )
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
        # Onboarding is marked complete via a later PATCH /auth/me/onboarding,
        # not here. Flipping it true at signup lets users skip the flow entirely.
        onboarding_complete=False,
        current_onboarding_step=0,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    # Send email verification (fire-and-forget — never blocks signup)
    try:
        await _send_email_verification_for(user, db)
    except Exception:
        logger.exception("Failed to dispatch verification email for user %s", user.id)
    token = create_access_token(user.id)
    return Token(access_token=token)


def _create_email_verify_token(user_id: UUID) -> str:
    """24-hour JWT scoped to email verification only."""
    expire = datetime.utcnow() + timedelta(hours=24)
    payload = {"sub": str(user_id), "exp": expire, "iat": datetime.utcnow(), "scope": "email_verify"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def _send_email_verification_for(user: User, db: AsyncSession) -> str:
    """Generate + dispatch a verification token. Returns the token (for dev echoing)."""
    from app.services.email_service import send_email_verification
    token = _create_email_verify_token(user.id)
    verify_url = f"{settings.EMAIL_VERIFY_URL_BASE}?token={token}"
    send_email_verification(user.email, verify_url)
    user.email_verification_sent_at = datetime.utcnow()
    await db.flush()
    return token


class VerifyEmailRequest(BaseModel):
    token: str


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Confirm an email address from the link sent on signup."""
    try:
        decoded = jwt.decode(payload.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if decoded.get("scope") != "email_verify":
            raise HTTPException(status_code=401, detail="Invalid verification token.")
        user_id = UUID(decoded["sub"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired verification token.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Account not found.")
    if not user.email_verified:
        user.email_verified = True
        await db.flush()
    return {"message": "Email verified."}


@router.post("/resend-verification")
async def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-issue an email verification token for the signed-in user."""
    from app.services.rate_limit import check_rate_limit, client_ip
    await check_rate_limit(db, f"resend-verify:{client_ip(request)}", limit=5, window_seconds=600)

    if current_user.email_verified:
        return {"message": "Email already verified."}
    is_prod = settings.ENV.lower() in ("prod", "production")
    token = await _send_email_verification_for(current_user, db)
    response: dict = {"message": "Verification email sent."}
    if not is_prod:
        # Dev/TestFlight convenience: echo the token so testers without inbox access can verify.
        response["debug_verification_token"] = token
    return response


@router.post("/login")
async def login(payload: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    from app.services.rate_limit import check_rate_limit, client_ip
    await check_rate_limit(db, f"login:{client_ip(request)}", limit=10, window_seconds=60)

    # Normalize email: case-insensitive lookup covers users who signed up with
    # mixed-case local parts (pydantic EmailStr only lowercases the domain).
    email_lower = payload.email.lower()
    from sqlalchemy import func as _func
    result = await db.execute(
        select(User).where(_func.lower(User.email) == email_lower)
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    # Transparent re-hash: if the user's stored hash used the old passlib
    # direct-bcrypt scheme, upgrade it to the current SHA-256+bcrypt scheme now.
    legacy_hashed_bytes = user.hashed_password.encode("utf-8")
    try:
        is_legacy = (
            not bcrypt.checkpw(_pre_hash(payload.password), legacy_hashed_bytes)
            and bcrypt.checkpw(payload.password.encode("utf-8"), legacy_hashed_bytes)
        )
    except Exception:
        is_legacy = False
    if is_legacy:
        user.hashed_password = hash_password(payload.password)
        await db.flush()
    # Account pending deletion — don't issue a real token; hand back a restore token
    if user.delete_requested_at is not None:
        await _log_event(
            db,
            user_id=user.id,
            event_type="login_blocked_pending_delete",
            ip=request.client.host if request.client else None,
            ua=request.headers.get("user-agent"),
        )
        pending_token = create_pending_restore_token(user.id)
        return JSONResponse(
            status_code=200,
            content={
                "pending_deletion": True,
                "deletion_date": user.deleted_at.isoformat() if user.deleted_at else None,
                "user_id": str(user.id),
                "pending_token": pending_token,
            },
        )
    # Drift the user's IANA timezone in from the client header on every login.
    from app.services.user_time import capture_user_timezone
    capture_user_timezone(request, user)
    await db.flush()
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def _create_password_reset_token(user_id: UUID) -> str:
    expire = datetime.utcnow() + timedelta(minutes=30)
    payload = {"sub": str(user_id), "exp": expire, "iat": datetime.utcnow(), "scope": "password_reset"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/forgot-password", status_code=202)
async def forgot_password(payload: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Start a password reset. Always returns 202 to avoid leaking which emails exist."""
    from app.services.rate_limit import check_rate_limit, client_ip
    from app.services.email_service import send_password_reset_email
    await check_rate_limit(db, f"forgot-password:{client_ip(request)}", limit=5, window_seconds=600)

    is_prod = settings.ENV.lower() in ("prod", "production")
    generic_response = {"message": "If that email is registered, a reset link has been sent."}

    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if user is None or user.deleted_at is not None:
        return generic_response

    reset_token = _create_password_reset_token(user.id)
    reset_url = f"{settings.PASSWORD_RESET_URL_BASE}?token={reset_token}"
    send_password_reset_email(user.email, reset_url)

    if not is_prod:
        # Dev/TestFlight convenience: log and echo the token so testers without
        # a deliverable inbox can still complete the flow.
        logger.info("Password reset for user_id=%s token=%s", user.id, reset_token)
        return {**generic_response, "debug_reset_token": reset_token}

    return generic_response


@router.post("/reset-password", response_model=Token)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    # Enforce same complexity rules as signup: 8+ chars, ≥1 letter, ≥1 digit.
    pw = payload.new_password
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if not any(c.isalpha() for c in pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one letter.")
    if not any(c.isdigit() for c in pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one number.")
    try:
        decoded = jwt.decode(payload.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if decoded.get("scope") != "password_reset":
            raise HTTPException(status_code=401, detail="Invalid reset token.")
        user_id = UUID(decoded["sub"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired reset token.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Account not found.")

    user.hashed_password = hash_password(payload.new_password)
    await db.flush()
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.post("/restore", response_model=Token)
async def restore_account(
    request: Request,
    user: User = Depends(get_user_from_pending_token),
    db: AsyncSession = Depends(get_db),
):
    """Restore a pending-deletion account during the grace window."""
    if user.delete_requested_at is None:
        raise HTTPException(status_code=400, detail="Account is not pending deletion")
    now = datetime.utcnow()
    # deleted_at is timezone-aware; compare naive UTC safely
    if user.deleted_at is not None:
        deleted_at_naive = user.deleted_at.replace(tzinfo=None) if user.deleted_at.tzinfo else user.deleted_at
        if deleted_at_naive <= now:
            raise HTTPException(status_code=410, detail="Grace period has expired")
    await restore_user(
        user,
        db,
        ip=request.client.host if request.client else None,
        ua=request.headers.get("user-agent"),
    )
    await db.flush()
    token = create_access_token(user.id)
    return Token(access_token=token)


@router.get("/check-username")
async def check_username(username: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Return whether a username is available (no auth required)."""
    from app.services.rate_limit import check_rate_limit, client_ip
    await check_rate_limit(db, f"check-username:{client_ip(request)}", limit=30, window_seconds=60)

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
