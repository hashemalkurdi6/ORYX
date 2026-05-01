# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

ARMEN is a fitness intelligence app. The backend ingests Strava activities and Apple HealthKit data, then uses AI (currently OpenAI gpt-4o-mini for diagnosis/autopsy/meal plans/assistant, Claude vision for food photo scanning) to generate plain-English performance diagnoses and per-workout autopsies. It includes a full social layer (posts, stories, likes, comments, follows, clubs).

## Running the App

**Backend** (requires PostgreSQL running and `oryx` database created):
```bash
cd armen/backend
source .venv/bin/activate       # macOS/Linux
.venv\Scripts\activate          # Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Tables and columns are auto-created/migrated on first startup via `_USER_COLUMN_MIGRATIONS` in `main.py`. API docs at `http://localhost:8000/docs`.

**Mobile** (physical iOS device requires local IP, not localhost):
```bash
cd armen/mobile
npm install           # first time
expo start            # or: expo start --ios / --android
# On Windows with physical device:
$env:REACT_NATIVE_PACKAGER_HOSTNAME="<your-local-ip>"
```

**Known Windows gotcha**: the project path contains `&` — if npm breaks, use a path without special characters.

## Architecture

```
armen/
  mobile/                    React Native (Expo Router, SDK 54)
    app/index.tsx            Entry — redirects based on auth token
    app/(auth)/              Login + Signup screens
    app/(tabs)/              Main tabs: dashboard, community, activity, nutrition, profile, wellness
    app/onboarding.tsx       First-run flow
    app/checkin.tsx          Daily check-in screen
    app/nutrition-survey.tsx Nutrition onboarding survey
    app/settings.tsx         App settings
    components/              Shared UI components
    services/api.ts          Axios client with Bearer interceptor + all API functions
    services/authStore.ts    Zustand store persisted to AsyncStorage
    services/healthKit.ts    HealthKit integration (dynamic require, no-op on Android/web)
    services/locationTracking.ts  GPS tracking for live workouts
    services/activityMetrics.ts   Metric calculations for activities

  backend/                   FastAPI + SQLAlchemy async + PostgreSQL
    app/main.py              App setup, CORS, lifespan, auto-migration SQL
    app/database.py          AsyncSession, auto-commit/rollback in get_db()
    app/routers/             One file per domain (25 routers total)
    app/models/              SQLAlchemy ORM models (one file per table)
    app/schemas/             Pydantic request/response schemas
    app/services/            Business logic: claude_service, strava_service,
                             readiness_service, nutrition_service, food_search_service,
                             deload_service, warmup_service, oura_service, whoop_service
```

**Backend routers**: auth, strava, health, diagnosis, whoop, oura, wellness, nutrition, user_activity, daily_steps, hevy, deload, warmup, food, home, meal_plan, weight, social, posts, feed, clubs, checkin, stories, media, users.

## Key Patterns

**DB migrations**: New columns are added via raw SQL in `_USER_COLUMN_MIGRATIONS` in `main.py` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). When adding a new column, update BOTH the migration SQL and the SQLAlchemy model class — they must stay in sync or INSERTs will fail with NOT NULL violations.

**Post likes**: `posts_likes` table with unique constraint on `(post_id, user_id)`. Use `pg_insert(...).on_conflict_do_nothing()` for like upserts. Endpoints: `POST /posts/{id}/like`, `DELETE /posts/{id}/like`.

**Stories**: 24-hour expiry. `story_type` and `is_highlight` are NOT NULL — always pass them explicitly in Story constructors. Feed is grouped by user, sorted own→unseen→seen.

**`UserOut` schema**: Uses `UserOutInternal` as intermediate — don't serialize `User` ORM objects directly to `UserOut`.

**Activity pace**: Stored as `avg_pace_seconds_per_km`, formatted to `"M:SS /km"` in `ActivityOut`.

**bcrypt**: Pin `bcrypt==4.0.1` — passlib 1.7.4 incompatible with bcrypt ≥ 4.1.

**HealthKit**: Dynamic `require('react-native-health')` in try/catch — no-op on Android/web.

**Missing API keys**:
- `OPENAI_API_KEY` is LOAD-BEARING for prod. Without it, diagnosis, autopsy, meal plans, nutrition assistant, and food scanning all return 503.
- `ANTHROPIC_API_KEY` is optional; only used by Claude-vision food photo scan.
- `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` are optional; routes 503 when missing.

## Environment Variables

Backend `armen/backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/oryx
SECRET_KEY=<random string>
OPENAI_API_KEY=<REQUIRED for diagnosis, autopsy, meal plans, assistant, scan>
ANTHROPIC_API_KEY=<optional, only for Claude vision food photo scan>
STRAVA_CLIENT_ID=<optional>
STRAVA_CLIENT_SECRET=<optional>
STRAVA_REDIRECT_URI=http://localhost:8000/strava/callback
CORS_ORIGINS=<optional comma-separated; defaults to localhost dev origins>
ENV=dev  # set to "prod" or "production" to disable base64 media fallback
```

Mobile `armen/mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://<local-ip>:8000
```

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
