import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, BigInteger, JSON, Integer, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.services.crypto import EncryptedString


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    strava_access_token: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    strava_refresh_token: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    strava_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    strava_athlete_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sports: Mapped[list | None] = mapped_column(JSON, nullable=True)
    followers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    following_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    whoop_access_token: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    whoop_refresh_token: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    whoop_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    whoop_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    oura_access_token: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    oura_refresh_token: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    oura_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    hevy_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    weight_unit: Mapped[str | None] = mapped_column(String(10), nullable=True, default="kg")
    # Onboarding fields
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sport_tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    primary_goal: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fitness_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    weekly_training_days: Mapped[str | None] = mapped_column(String(20), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    biological_sex: Mapped[str | None] = mapped_column(String(30), nullable=True)
    daily_calorie_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_training_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    current_onboarding_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False, server_default="1")
    # Profile Posts tab layout preference: 'grid' (3-col) | 'portfolio' (2-col, default) | 'timeline' (1-col)
    post_grid_layout: Mapped[str] = mapped_column(String(20), default="portfolio", nullable=False, server_default="portfolio")
    # Privacy — columns exist in DB via raw-SQL migrations; mirror on the ORM so
    # ORM writes (e.g. privacy settings screen) persist instead of silently no-oping.
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    dm_privacy: Mapped[str] = mapped_column(String(20), default="mutuals", nullable=False, server_default="mutuals")
    checkin_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    # IANA timezone name (e.g. "America/Los_Angeles"). Defaults to UTC if the
    # client doesn't send one; updated on login via `X-User-Timezone` header.
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False, server_default="UTC")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    # Soft-delete / account deletion lifecycle (NULL = active account)
    delete_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
