# Onboarding — Armen

Welcome. This doc gets you from zero to running the app and shipping changes.

## Project overview

ORYX (codename ARMEN) is a fitness intelligence app. The backend ingests Strava activities and Apple HealthKit data and uses AI (OpenAI `gpt-4o-mini` for diagnosis / autopsy / meal plans / assistant; Claude vision for food photo scanning) to generate plain-English performance diagnoses and per-workout autopsies. It includes a full social layer (posts, stories, likes, comments, follows, clubs).

## Tech stack and where things live

- **Mobile** — React Native + Expo (SDK 54), Expo Router. Lives in [armen/mobile/](../../armen/mobile/).
  - Entry: [app/index.tsx](../../armen/mobile/app/index.tsx) — redirects based on auth token.
  - Tabs: [app/(tabs)/](../../armen/mobile/app/(tabs)/) — `index.tsx` (home), `community`, `activity`, `nutrition`, `profile`, `wellness`.
  - Auth: [app/(auth)/](../../armen/mobile/app/(auth)/) — login, signup, forgot-password, verify-email.
  - Components: [components/](../../armen/mobile/components/) — see [docs/design/component-inventory.md](../design/component-inventory.md).
  - API client: [services/api.ts](../../armen/mobile/services/api.ts) — Axios + Bearer interceptor.
  - Auth store: [services/authStore.ts](../../armen/mobile/services/authStore.ts) — Zustand persisted to AsyncStorage.
  - Theme: [services/theme.ts](../../armen/mobile/services/theme.ts) — canonical tokens. See [docs/design/tokens.md](../design/tokens.md).
- **Backend** — FastAPI + SQLAlchemy async + PostgreSQL. Lives in [armen/backend/](../../armen/backend/).
  - Entry: [app/main.py](../../armen/backend/app/main.py) — app setup, CORS, lifespan, auto-migration SQL (`_USER_COLUMN_MIGRATIONS`).
  - DB: [app/database.py](../../armen/backend/app/database.py) — `AsyncSession`, auto-commit/rollback in `get_db()`.
  - Routers: [app/routers/](../../armen/backend/app/routers/) — one file per domain (auth, strava, health, diagnosis, whoop, oura, wellness, nutrition, user_activity, daily_steps, hevy, deload, warmup, food, home, meal_plan, weight, social, posts, feed, clubs, checkin, stories, media, users, messages, highlights).
  - Models: [app/models/](../../armen/backend/app/models/) — one file per table.
  - Services: [app/services/](../../armen/backend/app/services/) — `claude_service`, `strava_service`, `readiness_service`, `nutrition_service`, `food_search_service`, `deload_service`, `warmup_service`, `oura_service`, `whoop_service`, `email_service`.
- **Docs** — [docs/](../). The Obsidian vault you're reading right now. Spec, audits, decisions, design tokens, prompts.

## How to run things locally

### Backend

Requires PostgreSQL running and an `oryx` database created.

```bash
cd armen/backend
source .venv/bin/activate         # macOS/Linux
# .venv\Scripts\activate          # Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Tables and columns are auto-created/migrated on first startup via `_USER_COLUMN_MIGRATIONS` in [main.py](../../armen/backend/app/main.py). API docs at `http://localhost:8000/docs`.

### Mobile

A physical iOS device must hit the backend by local IP, not `localhost`.

```bash
cd armen/mobile
npm install                       # first time
expo start                        # or: expo start --ios / --android
```

Set the API URL in [armen/mobile/.env](../../armen/mobile/.env) to your dev machine's local IP:

```
EXPO_PUBLIC_API_URL=http://<your-local-ip>:8000
```

When the network changes (different wifi), update this file.

### Required env vars (backend)

In [armen/backend/.env](../../armen/backend/.env):

```
DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/oryx
SECRET_KEY=<random string>
OPENAI_API_KEY=<REQUIRED for diagnosis, autopsy, meal plans, assistant, scan>
ANTHROPIC_API_KEY=<optional, only for Claude vision food photo scan>
STRAVA_CLIENT_ID=<optional>
STRAVA_CLIENT_SECRET=<optional>
STRAVA_REDIRECT_URI=http://localhost:8000/strava/callback
CORS_ORIGINS=<optional, comma-separated; defaults to localhost dev origins>
ENV=dev
```

Without `OPENAI_API_KEY` the diagnosis / autopsy / meal-plan / nutrition-assistant / food-scan endpoints all return 503. Plan accordingly when working on prod-like flows.

## Claude Code agents

We use 5 specialised auditor agents under [.claude/agents/](../../.claude/agents/). Each owns a slice of the app and a specific audit:

- `activity-auditor` — activity tab, check-in, Track Activity, OutdoorTracker, manual workout logger, exercise library, plate calculator, RPE, muscle map, weight tracking, Strava/Hevy consumers.
- `backend-auditor` — FastAPI routers, SQLAlchemy models, Pydantic schemas, services, DB migrations, AI integrations, CORS, rate limiting.
- `home-wellness-auditor` — Home + Wellness tabs, GlassCard, AmbientBackdrop, WeightLogSheet, readiness ring, weekly load ring, daily diagnosis, water/weight tracking.
- `nutrition-auditor` — nutrition tab, survey, FoodSearchModal, food photo scan, meal plan generation, nutrition / meal_plan / food backend routers.
- `social-profile-auth-auditor` — auth flows, onboarding, profile, community feed, posts/likes/comments, follows, stories, clubs, DMs, settings.

Invoke them via the Agent tool when the work falls inside their scope. They have specialised prompts and produce better results than the generalist for in-scope work.

## Where to find...

- **Spec** → [docs/spec.md](../spec.md). Read at the start of every Claude Code session.
- **Current audit / priority list** → [docs/audit/consolidated-priority-list-2026-04-20.md](../audit/consolidated-priority-list-2026-04-20.md). Mark items done as we ship.
- **Design tokens** → [docs/design/tokens.md](../design/tokens.md).
- **Component inventory** → [docs/design/component-inventory.md](../design/component-inventory.md).
- **Decisions** → [docs/decisions/](../decisions/). One file per decision.
- **Saved prompts** → [docs/prompts/](../prompts/).
- **Bugs (active)** → [docs/bugs/known-issues.md](../bugs/known-issues.md).
- **Bugs (fixed, with commits)** → [docs/bugs/fixed.md](../bugs/fixed.md).

## Conventions

### Commits

- One commit per audit item. Atomic. If you can't describe the change in one line, it's two changes.
- Format: `type(scope): short summary` — e.g. `fix(activity): close 04-26 audit blockers`, `feat(meal-plan): regenerate on diet change`.
- Reference the audit item in the body when the change closes one.

### Decisions

When you make a non-trivial product or architecture call, write it as an ADR in [docs/decisions/](../decisions/) using the template in [decisions/README.md](../decisions/README.md). Filename: `YYYY-MM-DD-short-name.md`. Never edit a decided ADR — supersede it with a new one.

### Prompts

When a Claude Code prompt produces a great result, save it to [docs/prompts/](../prompts/) with a header explaining what it does, when to use it, and any gotchas.

### DB migrations

New columns live in `_USER_COLUMN_MIGRATIONS` in [armen/backend/app/main.py](../../armen/backend/app/main.py) as raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` SQL. **Always update both the migration SQL and the SQLAlchemy model class** — they must stay in sync or INSERTs will fail with NOT NULL violations.

### Theme

Don't hardcode hex. Use tokens from [services/theme.ts](../../armen/mobile/services/theme.ts). Status colours go through `theme.status.*` (or `accentForStatus(kind)`), not per-component red/yellow/green. See [docs/design/tokens.md](../design/tokens.md).

## Launch timeline

- **Target:** 2026-06-23 — TestFlight / first public build.
- **Audit cycle:** 5 audits per pass, one per agent, every ~1 week. Latest pass dated 2026-04-26 in [audits/](../../audits/).

## Who to ask about what

- **Product / spec / design direction** → Hashem.
- **Backend / DB / migrations** → Hashem (or `backend-auditor` agent for in-scope fixes).
- **Frontend / theme / components** → Hashem (or the relevant tab auditor agent).
- **AI prompts / model behaviour** → Hashem (we run `gpt-4o-mini` for most things, Claude vision for food scan).
- **Strava / Hevy / Whoop / Oura integrations** → [TODO: confirm with Hashem who owns each integration long-term].

## First-day checklist

1. Read [docs/spec.md](../spec.md) end-to-end.
2. Read the latest audit in [docs/audit/](../audit/).
3. Skim [docs/design/tokens.md](../design/tokens.md) and [docs/design/component-inventory.md](../design/component-inventory.md) — you'll come back to these constantly.
4. Get the backend running locally and load `/docs` to confirm.
5. Get the mobile app running on a device (login or signup).
6. Pick a small audit item, ship it as one commit, update the audit file marking it done.
