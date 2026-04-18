# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Token Efficiency Rules

- Read only files directly relevant to the current task. Do not explore the codebase broadly.
- Never read a file just to confirm its contents — trust the path and structure unless there's a specific reason to verify.
- Prefer targeted edits over full file rewrites.
- When running commands, scope them to the affected module only (e.g. test only the file you changed).
- Do not explain your reasoning unless asked. Skip preamble, summaries, and confirmations.
- Respond with code and minimal commentary. No "Great question!", no recap of what you just did.
- If you need clarification, ask one specific question — don't list options or explore multiple interpretations.
- Do not re-read files already in context. Reference what you know.
- Truncate tool output mentally — you don't need to process 200 lines of logs to find one error.

## What This Is

ARMEN is a fitness intelligence app. The backend ingests Strava activities and Apple HealthKit data, then uses the Claude API to generate plain-English performance diagnoses and per-workout autopsies. It includes a full social layer (posts, stories, likes, comments, follows, clubs).

## Running the App

**Backend** (requires PostgreSQL running and `armen` database created):
```bash
cd armen/backend
source venv/bin/activate       # macOS/Linux
venv\Scripts\activate          # Windows
uvicorn app.main:app --reload --host 0.0.0.0
```
Tables and columns are auto-created/migrated on first startup via `_USER_COLUMN_MIGRATIONS` in `main.py`. API docs at `http://localhost:8000/docs`.

**Mobile** (physical iOS device requires local IP, not localhost):
```bash
cd armen/mobile
# On Windows with physical device:
$env:REACT_NATIVE_PACKAGER_HOSTNAME="<your-local-ip>"
npm start
```

**Known Windows gotcha**: the project path contains `&` — if npm breaks, use a path without special characters.

## Architecture

```
armen/
  mobile/                   React Native (Expo Router, SDK 54)
    app/index.tsx           Entry — redirects based on auth token
    app/(auth)/             Login + Signup screens
    app/(tabs)/             Main tabs: dashboard, community, activity, nutrition, profile
    components/             Shared components (PostDetailModal, StoryCreator, etc.)
    services/api.ts         Axios client with Bearer interceptor + all API functions
    services/authStore.ts   Zustand store persisted to AsyncStorage

  backend/                  FastAPI + SQLAlchemy async + PostgreSQL
    app/main.py             App setup, CORS, lifespan, auto-migration SQL
    app/database.py         AsyncSession, auto-commit/rollback in get_db()
    app/routers/auth.py     JWT signup/login/me (HTTPBearer)
    app/routers/posts.py    Social posts CRUD + like/unlike endpoints
    app/routers/stories.py  Stories CRUD + feed (grouped by user, sorted own→unseen→seen)
    app/routers/strava.py   Full OAuth flow + activity sync
    app/routers/health.py   Bulk upsert HealthKit snapshots
    app/routers/diagnosis.py  Daily diagnosis + workout autopsy via Claude
    app/models/             SQLAlchemy ORM models (one file per table)
```

## Key Patterns

**DB migrations**: New columns are added via raw SQL in `_USER_COLUMN_MIGRATIONS` in `main.py` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). When adding a new column, update BOTH the migration SQL and the SQLAlchemy model class — they must stay in sync or INSERTs will fail with NOT NULL violations.

**Post likes**: `posts_likes` table with unique constraint on `(post_id, user_id)`. Use `pg_insert(...).on_conflict_do_nothing()` for like upserts. Endpoints: `POST /posts/{id}/like`, `DELETE /posts/{id}/like`.

**Stories**: 24-hour expiry. `story_type` and `is_highlight` are NOT NULL — always pass them explicitly in Story constructors. Feed is grouped by user, sorted own→unseen→seen.

**`UserOut` schema**: Uses `UserOutInternal` as intermediate — don't serialize `User` ORM objects directly to `UserOut`.

**Activity pace**: Stored as `avg_pace_seconds_per_km`, formatted to `"M:SS /km"` in `ActivityOut`.

**bcrypt**: Pin `bcrypt==4.0.1` — passlib 1.7.4 incompatible with bcrypt ≥ 4.1.

**HealthKit**: Dynamic `require('react-native-health')` in try/catch — no-op on Android/web.

**Missing API keys**: Strava and Anthropic keys are optional. Routes return `503` rather than crashing.

## Environment Variables

Backend `.env`:
```
DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/armen
SECRET_KEY=<random string>
ANTHROPIC_API_KEY=<optional>
STRAVA_CLIENT_ID=<optional>
STRAVA_CLIENT_SECRET=<optional>
STRAVA_REDIRECT_URI=http://localhost:8000/strava/callback
```

Mobile `.env`:
```
EXPO_PUBLIC_API_URL=http://<local-ip>:8000
```
