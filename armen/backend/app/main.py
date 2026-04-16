import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base

# Import models to ensure they are registered with Base.metadata
from app.models import user, activity, health_data  # noqa: F401
from app.models import whoop_data, oura_data  # noqa: F401
from app.models import wellness as wellness_model  # noqa: F401
from app.models import nutrition as nutrition_model  # noqa: F401
from app.models import user_activity as user_activity_model  # noqa: F401
from app.models import daily_steps as daily_steps_model  # noqa: F401
from app.models import hevy_workout as hevy_workout_model  # noqa: F401
from app.models import food as food_model  # noqa: F401

from app.routers import auth, strava, health, diagnosis
from app.routers import whoop, oura, wellness, nutrition
from app.routers import user_activity as user_activity_router
from app.routers import daily_steps as daily_steps_router
from app.routers import hevy as hevy_router
from app.routers import deload as deload_router
from app.routers import warmup as warmup_router
from app.routers import food as food_router


_USER_COLUMN_MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS sport_tags JSON",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_goal VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS fitness_level VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_training_days VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm FLOAT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS biological_sex VARCHAR(30)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_calorie_target INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_training_time VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_onboarding_step INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(10)",
    # Food feature columns (safe to re-run — IF NOT EXISTS)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS hevy_api_key VARCHAR(255)",
    # Training load columns
    "ALTER TABLE user_activities ADD COLUMN IF NOT EXISTS rpe INTEGER",
    "ALTER TABLE user_activities ADD COLUMN IF NOT EXISTS training_load INTEGER",
    "ALTER TABLE user_activities ADD COLUMN IF NOT EXISTS is_rest_day BOOLEAN NOT NULL DEFAULT FALSE",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Log API key status at startup
    from app.config import settings as _settings
    anthropic_key = _settings.ANTHROPIC_API_KEY
    if anthropic_key:
        logger.info("ANTHROPIC_API_KEY present (len=%d, starts=%s...)", len(anthropic_key), anthropic_key[:8])
    else:
        logger.warning("ANTHROPIC_API_KEY is MISSING — daily diagnosis / workout autopsy will fail")
    openai_key = _settings.OPENAI_API_KEY
    if openai_key:
        logger.info("OPENAI_API_KEY present (len=%d, starts=%s...)", len(openai_key), openai_key[:7])
    else:
        logger.warning("OPENAI_API_KEY is MISSING — food photo scanning will fail")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add any new columns to existing tables (idempotent)
        for stmt in _USER_COLUMN_MIGRATIONS:
            await conn.execute(text(stmt))
    yield
    await engine.dispose()


app = FastAPI(
    title="ORYX API",
    description="ORYX Fitness Intelligence",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(strava.router)
app.include_router(health.router)
app.include_router(diagnosis.router)
app.include_router(whoop.router)
app.include_router(oura.router)
app.include_router(wellness.router)
app.include_router(nutrition.router)
app.include_router(user_activity_router.router)
app.include_router(daily_steps_router.router)
app.include_router(hevy_router.router)
app.include_router(deload_router.router)
app.include_router(warmup_router.router)
app.include_router(food_router.router)


@app.get("/", tags=["health-check"])
async def root():
    return {"status": "ok", "app": "ORYX"}
