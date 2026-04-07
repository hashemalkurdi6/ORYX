from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    strava_connected: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def compute_strava_connected(cls, values):
        # Works both with ORM objects and dicts
        if hasattr(values, "strava_athlete_id"):
            strava_connected = values.strava_athlete_id is not None
            # Inject computed field by creating a proxy dict approach
            # We use __dict__ manipulation safely via model_validator
            object.__setattr__(values, "_strava_connected_computed", strava_connected)
        return values

    @field_validator("strava_connected", mode="before")
    @classmethod
    def set_strava_connected(cls, v, info):
        return v


class UserOutInternal(BaseModel):
    """Used internally to carry strava_athlete_id for computing strava_connected."""
    id: UUID
    email: str
    strava_athlete_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    def to_user_out(self) -> "UserOut":
        return UserOut(
            id=self.id,
            email=self.email,
            strava_connected=self.strava_athlete_id is not None,
            created_at=self.created_at,
        )


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str
