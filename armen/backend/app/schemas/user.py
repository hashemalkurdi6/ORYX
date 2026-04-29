# ORYX
from datetime import datetime
from uuid import UUID

from typing import Literal
from pydantic import BaseModel, EmailStr, field_validator, model_validator


def _validate_password_complexity(password: str) -> str:
    """Enforce min length 8, at least one letter and one digit.

    Used by both signup (UserCreate) and password reset endpoints so the rules
    stay consistent. Raises ValueError on failure (becomes 422 in pydantic flow).
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if not any(c.isalpha() for c in password):
        raise ValueError("Password must contain at least one letter.")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one number.")
    return password


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    username: str | None = None
    full_name: str | None = None
    sports: list[str] | None = None
    weight_kg: float | None = None
    # Onboarding fields — all optional, set onboarding_complete=True on signup.
    # daily_calorie_target is intentionally NOT accepted here: the backend
    # computes it via calculate_macro_targets so mobile and backend can never
    # diverge on the formula. See docs/bugs/calorie-target-inconsistency.md.
    display_name: str | None = None
    sport_tags: list[str] | None = None
    primary_goal: str | None = None
    fitness_level: str | None = None
    weekly_training_days: str | None = None
    age: int | None = None
    date_of_birth: str | None = None
    height_cm: float | None = None
    biological_sex: str | None = None
    preferred_training_time: str | None = None

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password_complexity(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    username: str | None
    full_name: str | None
    bio: str | None
    location: str | None
    sports: list[str] | None
    followers_count: int
    following_count: int
    strava_connected: bool
    whoop_connected: bool
    oura_connected: bool
    hevy_connected: bool
    weight_kg: float | None
    created_at: datetime
    # Onboarding fields
    display_name: str | None = None
    sport_tags: list[str] | None = None
    primary_goal: str | None = None
    fitness_level: str | None = None
    weekly_training_days: str | None = None
    age: int | None = None
    date_of_birth: str | None = None
    height_cm: float | None = None
    biological_sex: str | None = None
    daily_calorie_target: int | None = None
    preferred_training_time: str | None = None
    onboarding_complete: bool = False
    current_onboarding_step: int = 1
    post_grid_layout: str = "portfolio"
    email_verified: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def compute_connected_flags(cls, values):
        # Works both with ORM objects and dicts
        if hasattr(values, "strava_athlete_id"):
            strava_connected = values.strava_athlete_id is not None
            object.__setattr__(values, "_strava_connected_computed", strava_connected)
        return values

    @field_validator("strava_connected", mode="before")
    @classmethod
    def set_strava_connected(cls, v, info):
        return v

    @field_validator("whoop_connected", mode="before")
    @classmethod
    def set_whoop_connected(cls, v, info):
        return v

    @field_validator("oura_connected", mode="before")
    @classmethod
    def set_oura_connected(cls, v, info):
        return v


class UserOutInternal(BaseModel):
    """Used internally to carry token/athlete fields for computing connected flags."""
    id: UUID
    email: str
    username: str | None = None
    full_name: str | None = None
    bio: str | None = None
    location: str | None = None
    sports: list[str] | None = None
    followers_count: int = 0
    following_count: int = 0
    strava_athlete_id: int | None = None
    whoop_user_id: str | None = None
    whoop_access_token: str | None = None
    oura_access_token: str | None = None
    hevy_api_key: str | None = None
    weight_kg: float | None = None
    created_at: datetime
    # Onboarding fields
    display_name: str | None = None
    sport_tags: list[str] | None = None
    primary_goal: str | None = None
    fitness_level: str | None = None
    weekly_training_days: str | None = None
    age: int | None = None
    date_of_birth: str | None = None
    height_cm: float | None = None
    biological_sex: str | None = None
    daily_calorie_target: int | None = None
    preferred_training_time: str | None = None
    onboarding_complete: bool = False
    current_onboarding_step: int = 1
    post_grid_layout: str = "portfolio"
    email_verified: bool = False

    model_config = {"from_attributes": True}

    def to_user_out(self) -> "UserOut":
        return UserOut(
            id=self.id,
            email=self.email,
            username=self.username,
            full_name=self.full_name,
            bio=self.bio,
            location=self.location,
            sports=self.sports,
            followers_count=self.followers_count,
            following_count=self.following_count,
            strava_connected=self.strava_athlete_id is not None,
            whoop_connected=self.whoop_access_token is not None,
            oura_connected=self.oura_access_token is not None,
            hevy_connected=self.hevy_api_key is not None,
            weight_kg=self.weight_kg,
            created_at=self.created_at,
            display_name=self.display_name,
            sport_tags=self.sport_tags,
            primary_goal=self.primary_goal,
            fitness_level=self.fitness_level,
            weekly_training_days=self.weekly_training_days,
            age=self.age,
            date_of_birth=self.date_of_birth,
            height_cm=self.height_cm,
            biological_sex=self.biological_sex,
            daily_calorie_target=self.daily_calorie_target,
            preferred_training_time=self.preferred_training_time,
            onboarding_complete=self.onboarding_complete,
            current_onboarding_step=self.current_onboarding_step,
            post_grid_layout=self.post_grid_layout,
            email_verified=self.email_verified,
        )


class UserProfileUpdate(BaseModel):
    username: str | None = None
    full_name: str | None = None
    bio: str | None = None
    location: str | None = None
    sports: list[str] | None = None
    weight_kg: float | None = None
    # Posts tab layout preference — validated server-side so bad values can't land
    post_grid_layout: Literal['grid', 'portfolio', 'timeline'] | None = None


class OnboardingUpdate(BaseModel):
    display_name: str | None = None
    sport_tags: list[str] | None = None
    primary_goal: str | None = None
    fitness_level: str | None = None
    weekly_training_days: str | None = None
    age: int | None = None
    date_of_birth: str | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    biological_sex: str | None = None
    # daily_calorie_target intentionally not accepted — see UserCreate.
    preferred_training_time: str | None = None
    onboarding_complete: bool | None = None
    current_onboarding_step: int | None = None


class PendingDeletionResponse(BaseModel):
    pending_deletion: bool = True
    deletion_date: str | None
    user_id: str
    pending_token: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str
