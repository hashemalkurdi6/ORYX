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
from app.models import diagnosis as diagnosis_model  # noqa: F401
from app.models import nutrition_profile as nutrition_profile_model  # noqa: F401
from app.models import meal_plan as meal_plan_model  # noqa: F401
from app.models import readiness_cache as readiness_cache_model  # noqa: F401
from app.models import nutrition_targets as nutrition_targets_model  # noqa: F401
from app.models import daily_nutrition_summary as daily_nutrition_summary_model  # noqa: F401
from app.models import daily_water_intake as daily_water_intake_model  # noqa: F401
from app.models import weight_log as weight_log_model  # noqa: F401
from app.models import social_post as social_post_model  # noqa: F401
from app.models import social_reaction as social_reaction_model  # noqa: F401
from app.models import social_comment as social_comment_model  # noqa: F401
from app.models import social_follow as social_follow_model  # noqa: F401
from app.models import club as club_model  # noqa: F401
from app.models import club_membership as club_membership_model  # noqa: F401
from app.models import daily_checkin as daily_checkin_model  # noqa: F401
from app.models import story as story_model  # noqa: F401
from app.models import story_view as story_view_model  # noqa: F401
from app.models import user_block as user_block_model  # noqa: F401
from app.models import user_report as user_report_model  # noqa: F401
from app.models import post_report as post_report_model  # noqa: F401
from app.models import saved_post as saved_post_model  # noqa: F401
from app.models import hidden_post as hidden_post_model  # noqa: F401
from app.models import post_view as post_view_model  # noqa: F401
from app.models import post_like as post_like_model  # noqa: F401

from app.routers import auth, strava, health, diagnosis
from app.routers import whoop, oura, wellness, nutrition
from app.routers import user_activity as user_activity_router
from app.routers import daily_steps as daily_steps_router
from app.routers import hevy as hevy_router
from app.routers import deload as deload_router
from app.routers import warmup as warmup_router
from app.routers import food as food_router
from app.routers import home as home_router
from app.routers import meal_plan as meal_plan_router
from app.routers import weight as weight_router
from app.routers import social as social_router
from app.routers import posts as posts_router
from app.routers import feed as feed_router
from app.routers import clubs as clubs_router
from app.routers import checkin as checkin_router
from app.routers import stories as stories_router
from app.routers import media as media_router
from app.routers import users as users_router


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
    # Wellness — Hooper Index fields (1-7 scale, all nullable for backward compat)
    "ALTER TABLE wellness_checkins ADD COLUMN IF NOT EXISTS sleep_quality INTEGER",
    "ALTER TABLE wellness_checkins ADD COLUMN IF NOT EXISTS fatigue INTEGER",
    "ALTER TABLE wellness_checkins ADD COLUMN IF NOT EXISTS stress INTEGER",
    "ALTER TABLE wellness_checkins ADD COLUMN IF NOT EXISTS muscle_soreness INTEGER",
    # Make legacy wellness fields nullable (existing data stays; new clients send Hooper fields)
    "ALTER TABLE wellness_checkins ALTER COLUMN mood DROP NOT NULL",
    "ALTER TABLE wellness_checkins ALTER COLUMN energy DROP NOT NULL",
    "ALTER TABLE wellness_checkins ALTER COLUMN soreness DROP NOT NULL",
    # Nutrition profile — foods_disliked + foods_loved JSON migration
    "ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS foods_disliked JSON",
    """DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nutrition_profiles' AND column_name='foods_loved' AND udt_name='text') THEN ALTER TABLE nutrition_profiles ALTER COLUMN foods_loved TYPE JSON USING NULL; END IF; END $$""",
    # Remove duplicate meal_plans rows (keep newest per user+date), then add unique constraint
    """
    DELETE FROM meal_plans mp1
    USING meal_plans mp2
    WHERE mp1.user_id = mp2.user_id
      AND mp1.date = mp2.date
      AND mp1.generated_at < mp2.generated_at
    """,
    """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'meal_plans' AND constraint_name = 'uq_meal_plans_user_date'
      ) THEN
        ALTER TABLE meal_plans ADD CONSTRAINT uq_meal_plans_user_date UNIQUE (user_id, date);
      END IF;
    END $$
    """,
    # NutritionLog micronutrient fields
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS sugar_g FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS sodium_mg FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS vitamin_d_iu FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS magnesium_mg FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS iron_mg FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS calcium_mg FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS zinc_mg FLOAT",
    "ALTER TABLE nutrition_logs ADD COLUMN IF NOT EXISTS omega3_g FLOAT",
    # DailyNutritionSummary micronutrient consumed fields
    "ALTER TABLE daily_nutrition_summaries ADD COLUMN IF NOT EXISTS vitamin_d_consumed_iu FLOAT NOT NULL DEFAULT 0",
    "ALTER TABLE daily_nutrition_summaries ADD COLUMN IF NOT EXISTS magnesium_consumed_mg FLOAT NOT NULL DEFAULT 0",
    "ALTER TABLE daily_nutrition_summaries ADD COLUMN IF NOT EXISTS iron_consumed_mg FLOAT NOT NULL DEFAULT 0",
    "ALTER TABLE daily_nutrition_summaries ADD COLUMN IF NOT EXISTS calcium_consumed_mg FLOAT NOT NULL DEFAULT 0",
    "ALTER TABLE daily_nutrition_summaries ADD COLUMN IF NOT EXISTS zinc_consumed_mg FLOAT NOT NULL DEFAULT 0",
    "ALTER TABLE daily_nutrition_summaries ADD COLUMN IF NOT EXISTS omega3_consumed_g FLOAT NOT NULL DEFAULT 0",
    # FoodCache micronutrient fields
    "ALTER TABLE foods_cache ADD COLUMN IF NOT EXISTS vitamin_d_100g FLOAT",
    "ALTER TABLE foods_cache ADD COLUMN IF NOT EXISTS magnesium_100g FLOAT",
    "ALTER TABLE foods_cache ADD COLUMN IF NOT EXISTS iron_100g FLOAT",
    "ALTER TABLE foods_cache ADD COLUMN IF NOT EXISTS calcium_100g FLOAT",
    "ALTER TABLE foods_cache ADD COLUMN IF NOT EXISTS zinc_100g FLOAT",
    "ALTER TABLE foods_cache ADD COLUMN IF NOT EXISTS omega3_100g FLOAT",
    # CustomFood micronutrient fields
    "ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS vitamin_d_100g FLOAT",
    "ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS magnesium_100g FLOAT",
    "ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS iron_100g FLOAT",
    "ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS calcium_100g FLOAT",
    "ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS zinc_100g FLOAT",
    "ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS omega3_100g FLOAT",
    # MealPlan modifications history
    "ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS modifications JSON",
    # Water tracking table
    """
    CREATE TABLE IF NOT EXISTS daily_water_intake (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        glasses_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, date)
    )
    """,
    # Ensure the unique constraint exists (in case table was created by create_all without it)
    """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'daily_water_intake'
          AND constraint_name = 'daily_water_intake_user_id_date_key'
          AND constraint_type = 'UNIQUE'
      ) THEN
        ALTER TABLE daily_water_intake ADD CONSTRAINT daily_water_intake_user_id_date_key UNIQUE (user_id, date);
      END IF;
    END $$
    """,
    # Water tracking — new ml-based columns
    "ALTER TABLE daily_water_intake ADD COLUMN IF NOT EXISTS amount_ml INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE daily_water_intake ADD COLUMN IF NOT EXISTS container_size_ml INTEGER NOT NULL DEFAULT 250",
    # Migrate legacy glasses_count → amount_ml (250ml per glass)
    "UPDATE daily_water_intake SET amount_ml = glasses_count * 250 WHERE amount_ml = 0 AND glasses_count > 0",
    # Nutrition targets — personalized water target
    "ALTER TABLE nutrition_targets ADD COLUMN IF NOT EXISTS water_target_ml INTEGER",
    # Nutrition profile — water preferences
    "ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS water_target_override_ml INTEGER",
    "ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS container_size_ml INTEGER",
    "ALTER TABLE nutrition_profiles ADD COLUMN IF NOT EXISTS water_input_mode VARCHAR(20)",
    # Dedup existing rest day entries — keep oldest per (user_id, date)
    """
    DELETE FROM user_activities ua1
    USING user_activities ua2
    WHERE ua1.user_id = ua2.user_id
      AND ua1.is_rest_day = TRUE
      AND ua2.is_rest_day = TRUE
      AND DATE(ua1.logged_at) = DATE(ua2.logged_at)
      AND ua1.logged_at > ua2.logged_at
    """,
    # Weight tracking
    """
    CREATE TABLE IF NOT EXISTS weight_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        weight_kg FLOAT NOT NULL,
        logged_at TIMESTAMP NOT NULL DEFAULT NOW(),
        note TEXT,
        source VARCHAR(50) DEFAULT 'manual'
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_weight_logs_user_logged_at ON weight_logs (user_id, logged_at DESC)",
    # User weight_unit column
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_unit VARCHAR(10) DEFAULT 'kg'",
    # Seed weight_logs from onboarding weight_kg for users who have it set but no log yet
    """
    INSERT INTO weight_logs (id, user_id, weight_kg, logged_at, source)
    SELECT gen_random_uuid(), id, weight_kg, created_at, 'onboarding'
    FROM users
    WHERE weight_kg IS NOT NULL
      AND id NOT IN (SELECT DISTINCT user_id FROM weight_logs)
    """,
    # Community feature columns on users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS checkin_streak INTEGER NOT NULL DEFAULT 0",
    # Social posts
    """
    CREATE TABLE IF NOT EXISTS social_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        post_type VARCHAR(50) NOT NULL,
        content_json JSON,
        photo_url TEXT,
        caption TEXT,
        user_caption TEXT,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts (user_id, created_at DESC)",
    # Social reactions
    """
    CREATE TABLE IF NOT EXISTS social_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction_type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_social_reaction UNIQUE (post_id, user_id, reaction_type)
    )
    """,
    # Social comments
    """
    CREATE TABLE IF NOT EXISTS social_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment_text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # Social follows
    """
    CREATE TABLE IF NOT EXISTS social_follows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_social_follow UNIQUE (follower_id, following_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows (follower_id)",
    "CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows (following_id)",
    # Clubs
    """
    CREATE TABLE IF NOT EXISTS clubs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        sport_type VARCHAR(50) NOT NULL,
        cover_image VARCHAR(100),
        description VARCHAR(300),
        member_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # Club memberships
    """
    CREATE TABLE IF NOT EXISTS club_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_club_membership UNIQUE (club_id, user_id)
    )
    """,
    # Daily checkins
    """
    CREATE TABLE IF NOT EXISTS daily_checkins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        photo_url TEXT,
        caption TEXT,
        stats_overlay_json JSON,
        influence_tags JSON,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        window_expires_at TIMESTAMP,
        post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_daily_checkins_user ON daily_checkins (user_id, created_at DESC)",
    # Stories
    """
    CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        story_type VARCHAR(50) NOT NULL,
        media_url TEXT,
        caption TEXT,
        stats_overlay_json JSON,
        influence_tags JSON,
        source_post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        is_expired BOOLEAN NOT NULL DEFAULT FALSE,
        is_highlight BOOLEAN NOT NULL DEFAULT FALSE,
        highlight_category VARCHAR(100)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_stories_user_created ON stories (user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories (expires_at) WHERE is_expired = FALSE",
    # Story views
    """
    CREATE TABLE IF NOT EXISTS story_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_story_view UNIQUE (story_id, viewer_user_id)
    )
    """,
    # Fix stories.source_post_id FK to CASCADE on post delete
    """
    DO $$ BEGIN
      UPDATE stories SET source_post_id = NULL
        WHERE source_post_id IS NOT NULL
        AND source_post_id NOT IN (SELECT id FROM social_posts);
      ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_source_post_id_fkey;
      ALTER TABLE stories ADD CONSTRAINT stories_source_post_id_fkey
        FOREIGN KEY (source_post_id) REFERENCES social_posts(id) ON DELETE SET NULL;
    END $$
    """,
    # ── Stories table: new schema columns ──────────────────────────────────────
    "ALTER TABLE stories ADD COLUMN IF NOT EXISTS photo_url TEXT",
    "UPDATE stories SET photo_url = media_url WHERE photo_url IS NULL AND media_url IS NOT NULL",
    "ALTER TABLE stories ADD COLUMN IF NOT EXISTS oryx_data_overlay_json JSON",
    "UPDATE stories SET oryx_data_overlay_json = stats_overlay_json WHERE oryx_data_overlay_json IS NULL AND stats_overlay_json IS NOT NULL",
    "ALTER TABLE stories ADD COLUMN IF NOT EXISTS text_overlay TEXT",
    """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stories' AND column_name = 'checkin_id'
      ) THEN
        ALTER TABLE stories ADD COLUMN checkin_id UUID REFERENCES daily_checkins(id) ON DELETE SET NULL;
      END IF;
    END $$
    """,
    # ── Social posts table: new schema columns ─────────────────────────────────
    "ALTER TABLE social_posts ALTER COLUMN post_type DROP NOT NULL",
    "ALTER TABLE social_posts ALTER COLUMN is_public DROP NOT NULL",
    "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS oryx_data_card_json JSON",
    "UPDATE social_posts SET oryx_data_card_json = content_json WHERE oryx_data_card_json IS NULL AND content_json IS NOT NULL",
    "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS also_shared_as_story BOOLEAN NOT NULL DEFAULT FALSE",
    """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_posts' AND column_name = 'story_id'
      ) THEN
        ALTER TABLE social_posts ADD COLUMN story_id UUID REFERENCES stories(id) ON DELETE SET NULL;
      END IF;
    END $$
    """,
    """
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_posts' AND column_name = 'club_id'
      ) THEN
        ALTER TABLE social_posts ADD COLUMN club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
      END IF;
    END $$
    """,
    "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()",
    # User blocks
    """
    CREATE TABLE IF NOT EXISTS user_blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_block UNIQUE (blocker_id, blocked_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks (blocker_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id)",
    # User reports
    """
    CREATE TABLE IF NOT EXISTS user_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports (reporter_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports (reported_id)",
    # Post reports
    "CREATE TABLE IF NOT EXISTS post_reports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reporter_user_id TEXT NOT NULL, reported_post_id TEXT NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT NOW())",
    # Social posts — is_pinned, is_archived columns
    "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE",
    # Social comments — parent_comment_id for replies, like_count
    "ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES social_comments(id) ON DELETE CASCADE",
    "ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0",
    # Saved posts table
    """
    CREATE TABLE IF NOT EXISTS saved_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_saved_post UNIQUE (user_id, post_id)
    )
    """,
    # Hidden posts table
    """
    CREATE TABLE IF NOT EXISTS hidden_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        hidden_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_hidden_post UNIQUE (user_id, post_id)
    )
    """,
    # Post views table
    """
    CREATE TABLE IF NOT EXISTS post_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_post_view UNIQUE (post_id, viewer_user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views (post_id)",
    "CREATE INDEX IF NOT EXISTS idx_saved_posts_user ON saved_posts (user_id, saved_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_hidden_posts_user ON hidden_posts (user_id)",
    # Post likes table
    """
CREATE TABLE IF NOT EXISTS posts_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_post_like UNIQUE (post_id, user_id)
)
""",
    "CREATE INDEX IF NOT EXISTS idx_posts_likes_post ON posts_likes (post_id)",
    "CREATE INDEX IF NOT EXISTS idx_posts_likes_user ON posts_likes (user_id)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
    "ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT USING avatar_url::TEXT",
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
    # Seed default clubs after tables are created
    from app.database import AsyncSessionLocal
    from app.routers.clubs import seed_default_clubs
    async with AsyncSessionLocal() as seed_session:
        async with seed_session.begin():
            await seed_default_clubs(seed_session)
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
app.include_router(home_router.router)
app.include_router(meal_plan_router.router)
app.include_router(weight_router.router)
app.include_router(social_router.router)
app.include_router(posts_router.router)
app.include_router(feed_router.router)
app.include_router(clubs_router.router)
app.include_router(checkin_router.router)
app.include_router(stories_router.router)
app.include_router(media_router.router)
app.include_router(users_router.router)


@app.get("/", tags=["health-check"])
async def root():
    return {"status": "ok", "app": "ORYX"}
