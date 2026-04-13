import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, BigInteger, JSON, Integer, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    strava_access_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    strava_refresh_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    strava_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    strava_athlete_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sports: Mapped[list | None] = mapped_column(JSON, nullable=True)
    followers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    following_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    whoop_access_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    whoop_refresh_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    whoop_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    whoop_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    oura_access_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    oura_refresh_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    oura_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    hevy_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
