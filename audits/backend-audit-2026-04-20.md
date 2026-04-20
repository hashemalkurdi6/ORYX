# ORYX Backend Audit — 2026-04-20

**Scope:** `armen/backend/` (FastAPI + SQLAlchemy async + PostgreSQL)
**Auditor:** Backend audit agent (read-only)
**Approach:** Mapped every router/model/service; cross-referenced endpoints against `armen/mobile/services/api.ts`; compared against full ORYX spec.

---

## TL;DR

The backend is **surprisingly mature** — 27 routers, 40+ models, 9 services, ~13K LOC. Core flows work: auth/JWT, onboarding, Strava/Whoop/Oura OAuth + sync, Hevy API key sync, readiness scoring with EWMA-ACWR, AI daily diagnosis, workout autopsy, meal plan generation, food photo scanning, full social layer (posts/likes/comments/follows/stories/clubs), DMs, weight/water tracking.

Significant issues:
- **No Alembic migrations in use** — schema is maintained via `Base.metadata.create_all` + a long list of raw `ALTER TABLE ... IF NOT EXISTS` statements in `main.py`. This is fragile and the User model has drifted (missing several columns that the SQL migrations add).
- **Spec calls for OpenAI GPT-4o-mini everywhere** — code actually matches (GPT-4o-mini used), but the `anthropic` client is imported + instantiated and never called. Several endpoints gate on `ANTHROPIC_API_KEY` being set even though the actual call uses the `OPENAI_API_KEY` — misleading and will produce "not configured" 503s when OpenAI is fine.
- **Daily diagnosis has TWO implementations** (`/diagnosis/daily` and `/home/diagnosis`) with different prompts and different caching.
- **`boto3` and `Pillow` are imported in `media.py` but not in `requirements.txt`** — uploads will silently fall back to base64 data URLs.
- **CORS is wide-open** (`allow_origins=["*"]`).
- **In-memory rate limiting** (`_assistant_rate` dict) — loses state on restart and doesn't scale across workers.
- **`alembic==1.13.2` is in requirements but there is no `alembic/` directory in the repo.**

Sections below walk through features, endpoints, schema, integrations, AI systems, and the readiness function individually.

---

## Auth & Users

### Auth
**Files:** `app/routers/auth.py`, `app/schemas/user.py`, `app/models/user.py`
**Implementation status:** complete
**Data:** JWT stateless HS256 tokens. Password = bcrypt over SHA256+b64 pre-hash (to dodge 72-byte limit). 7-day token expiry.
**Broken / partial:**
- `/auth/check-username` has no auth (intentional).
- `PUT /auth/profile` and `PATCH /auth/me/profile` are near-duplicates — dead code risk.
**Missing from spec:** Email verification, password reset, social sign-in — none required by spec, absent.
**Endpoints exposed:**
- POST `/auth/signup` — complete, called by mobile
- POST `/auth/login` — complete, called
- GET `/auth/me` — complete, called
- PUT `/auth/profile`, PATCH `/auth/me/profile`, PATCH `/auth/me/onboarding` — all called
- GET `/auth/check-username` — called
**Notes:** Three overlapping profile-update routes: `PUT /auth/profile`, `PATCH /auth/me/profile`, `PATCH /users/me/profile` (in `users.py`). Pick one.

### Users / Public profile / Blocks / Reports
**Files:** `app/routers/users.py`
**Implementation status:** complete
**Data:** real
**Broken / partial:**
- `recent_achievements` hard-coded to `[]` on public profile response.
- Personal bests and activity heatmap queries present but untested with real data.
**Missing from spec:**
- Profile customization (featured stats, stat visibility, bottom-sheet pickers) — only `post_grid_layout` is persisted. Rest is frontend-only.
- Achievements grid and 365-day heatmap — heatmap endpoint exists; achievements/PB grid mostly absent (returns []).
**Endpoints:**
- PATCH `/users/me/profile` (duplicate of auth profile update) — called
- GET `/users/{id}/profile`, `/users/{id}/posts`, `/users/{id}/activity-heatmap`, `/users/{id}/personal-bests` — called
- POST `/users/{id}/report`, `/users/{id}/block`, DELETE unblock — called
**Notes:** `is_private`, `avatar_url` (migration upgrades to TEXT), `checkin_streak`, `dm_privacy` are columns added via raw SQL migrations but **missing from the `User` ORM model**. Code uses `getattr(user, "is_private", False)` defensively — reads work, but ORM writes to those fields will silently not persist.

---

## Home / Dashboard / Diagnosis

### Home dashboard
**Files:** `app/routers/home.py` (744 lines)
**Implementation status:** complete
**Data:** real — pulls from activities, nutrition, weight, wellness, health snapshots, readiness cache.
**Broken / partial:**
- Large monolithic `get_dashboard` function — 400+ lines.
- Duplicates macro-target logic from `nutrition_service.py`.
**Missing from spec:** Strain gauge bar recommendation computation is rudimentary; Quick Actions pills are UI-only.
**Endpoints:**
- GET `/home/dashboard` — called
- POST `/home/diagnosis` — called (with `force` query). Caches via `Diagnosis` model (1-hour respect on force); uses OpenAI gpt-4o-mini inline (NOT via `claude_service`).

### Daily diagnosis (v2 path)
**Files:** `app/routers/diagnosis.py`, `app/services/claude_service.py`
**Implementation status:** complete
**Data:** real — pulls 7 days health, WHOOP, Oura, today's wellness + nutrition, last 3 Strava activities.
**Broken / partial:**
- `_require_anthropic_key()` guard checks `ANTHROPIC_API_KEY` but the actual call uses `_openai_client` with `gpt-4o-mini`. Mismatch — endpoint will 503 if only OpenAI key is set.
- **No caching at all** on this endpoint — every call hits OpenAI.
- Duplicates `/home/diagnosis` with a different prompt shape and different response keys (`recovery_score`, `recovery_color` vs `diagnosis_text`, `contributing_factors`).
**Missing from spec:** Spec: "cached daily, refresh on new data (max 1/hour)." `/home/diagnosis` implements this; `/diagnosis/daily` does not.
**Endpoints:**
- GET `/diagnosis/daily` — called (`getDailyDiagnosis`)
- POST `/diagnosis/autopsy/{activity_id}` — called
**Notes:** Two diagnosis surfaces is tech debt. Pick one.

---

## Activity / Training Load / Readiness

### User activities (manual logger)
**Files:** `app/routers/user_activity.py`, `app/models/user_activity.py`, `app/schemas/user_activity.py`
**Implementation status:** complete
**Endpoints exposed:**
- POST `/activities/` (log), POST `/activities/rest` (log rest day, dedupes), PATCH `/activities/{id}/rpe`, POST `/activities/{id}/autopsy`, POST `/activities/regenerate-autopsies`, DELETE `/activities/{id}` — all called
- GET `/activities/`, `/activities/stats`, `/activities/weekly-load`, `/activities/heatmap`, `/activities/readiness` — all called
**Broken / partial:**
- Rest day endpoint uses `db.commit()` mid-request; rest of app uses auto-commit in `get_db`. Inconsistent.
**Missing from spec:**
- Deload detector exists at `/deload/status`.
- Warmup generator at `/warmup/generate`.
- Plate calculator, superset tracker, rest timer — frontend; backend stores `exercise_data` JSON blob.

### Strava activities
**Files:** `app/routers/strava.py`, `app/services/strava_service.py`, `app/models/activity.py`
**Implementation status:** complete
**Data:** real — OAuth flow, token refresh, pagination, upsert by strava_id
**Broken / partial:** Strava activities do NOT feed into training-load calculations (`UserActivity` is the load source). So imported Strava activities show in feed/activity tab but don't influence ACWR/readiness. Likely wrong — see Concerns.
**Endpoints:** GET `/strava/auth-url`, GET `/strava/callback`, POST `/strava/sync`, GET `/strava/activities` — all called

### Hevy
**Files:** `app/routers/hevy.py`, `app/models/hevy_workout.py`, `app/schemas/hevy.py`
**Implementation status:** complete
**Data:** real — API-key auth, full paged sync, autopsy on insert
**Broken / partial:** Like Strava, Hevy workouts do NOT write to `UserActivity` / training_load — display-only, doesn't feed readiness / ACWR.
**Endpoints:** POST `/hevy/connect`, POST `/hevy/sync`, GET `/hevy/workouts`, DELETE `/hevy/disconnect` — all called

### Readiness score
**Files:** `app/services/readiness_service.py`, `app/models/readiness_cache.py`
**Implementation status:** **complete and well-built — the strongest piece of the codebase**
**Per-spec check:**
- ✅ Single shared function `calculate_readiness(user_id, db)`
- ✅ Four components: Hooper 40% / Training Load 35% / Nutrition 15% / Sleep 10%
- ✅ Dynamic weight redistribution when components missing
- ✅ EWMA-ACWR with lambda_a=0.25, lambda_c≈0.067
- ✅ Monotony penalty (>2.0 → −10)
- ✅ Consecutive-no-rest penalty (≥5d → −10; ≥6d → −20)
- ✅ Protein 1.6g/kg nutritional recovery
- ✅ Post-workout timing penalty (2-hour window → −10)
- ✅ Caloric adjustment for training days (×1.10 when prev-day load > 200)
- ✅ Sleep only if Apple Health (never estimated)
- ✅ Yesterday's Hooper gets a 5-point recency penalty
- ✅ 1-hour cache (`ReadinessCache` table, upsert via `on_conflict_do_update`)
- ✅ `invalidate_readiness_cache()` called from nutrition log, wellness checkin, rest day, activity log
- ✅ Hardware slots reserved (HRV, RHR, SpO2 — currently only HRV via Apple Health health snapshot exposed)
- ⚠️ Label for <40 is "Rest Recommended"; spec says "Rest". Cosmetic.
- ⚠️ `data_confidence` uses "High Confidence" style labels; spec says "High". Cosmetic.
- ⚠️ Called from `/home/dashboard`, `/activities/readiness`, `/posts/insight-data` — only ONE canonical implementation. 👍

---

## Wellness / Health

### Wellness check-ins
**Files:** `app/routers/wellness.py`, `app/models/wellness.py`, `app/schemas/wellness.py`
**Implementation status:** complete
**Endpoints:** POST `/wellness/checkin` (upsert), GET `/wellness/checkins`, GET `/wellness/trends` — all called
**Notes:** Legacy fields (`mood`, `energy`, `soreness`) kept nullable alongside Hooper fields. Invalidates readiness cache on write. ✅

### Apple Health snapshots
**Files:** `app/routers/health.py`, `app/models/health_data.py`
**Implementation status:** complete
**Endpoints:** POST `/health/snapshots`, GET `/health/snapshots` — called. Mobile pushes from `react-native-health`.

### Daily steps
**Files:** `app/routers/daily_steps.py`
**Endpoints:** POST `/steps/`, GET `/steps/weekly` — called

---

## Nutrition

**Files:** `app/routers/nutrition.py`, `app/routers/meal_plan.py`, `app/services/nutrition_service.py`, `app/services/food_search_service.py`, models: `nutrition.py`, `nutrition_profile.py`, `nutrition_targets.py`, `daily_nutrition_summary.py`, `daily_water_intake.py`, `food.py`, `meal_plan.py`
**Implementation status:** complete
**Data:** real — invalidates readiness on log, updates daily summary, personalized water target

**Endpoints:**
- POST `/nutrition/scan` — OpenAI vision, called
- POST `/nutrition/log`, GET `/nutrition/today`, GET `/nutrition/logs`, DELETE `/nutrition/log/{id}` — called
- GET `/nutrition/targets`, POST `/nutrition/targets/recalculate` — called
- GET `/nutrition/water/today`, PATCH `/nutrition/water/today`, PATCH `/nutrition/water/settings` — called
- GET `/nutrition/weekly-summary`, GET `/nutrition/weekly-calories` — called
- GET `/nutrition/search` (OFF+USDA), GET `/nutrition/barcode/{barcode}`, `/nutrition/recent`, `/nutrition/frequent`, POST/GET `/nutrition/foods/custom` — called
- GET `/nutrition/profile`, PATCH `/nutrition/profile` — called
- GET `/nutrition/meal-plan/today`, POST `/nutrition/meal-plan/regenerate` — called
- POST `/nutrition/meals/save`, GET `/nutrition/meals/saved`, DELETE `/nutrition/meals/saved/{id}` — called
- POST `/nutrition/assistant` — called

**Broken / partial:**
- **Meal plan regeneration limit (spec: 1/hour) — COMMENTED OUT** in code: `# Regeneration limit disabled for development`. Launch blocker: unlimited OpenAI calls per user.
- Assistant rate limit is in-memory (`_assistant_rate: dict`) — resets on restart, not shared across workers. Needs Redis/DB.
- Meal plan JSON enforced via prompt only (no schema validation; malformed responses → 500).
- `NutritionLog` model has `sugar_g`, `sodium_mg`, etc.; many micronutrient columns added via raw SQL migrations.

**Missing from spec:**
- Nutrition survey 6-screen flow is a client concern — backend accepts combined profile PATCH.
- Meal-modification intent detection relies on the assistant appending a special `MEAL_MODIFICATION:` block; parsing of that block and application to the stored `meal_plans.modifications` JSON column — column exists, parsing path **needs manual testing**.
- Grocery list generation is baked into the meal plan prompt — depends on model compliance.

---

## Weight

**Files:** `app/routers/weight.py`, `app/models/weight_log.py`
**Implementation status:** complete
**Endpoints:** POST `/weight/log`, GET `/weight/history`, GET `/weight/summary`, POST `/weight/settings` — all called
**Data:** seeded from onboarding weight_kg via migration SQL; stored in kg; rolling 7-day average; streak. Spec's 14-log minimum for goal alignment — present.

---

## Social

### Posts, reactions, comments, saves, views, likes
**Files:** `app/routers/posts.py` (863 lines), `app/routers/feed.py`
**Implementation status:** complete
**Endpoints:**
- POST `/posts`, DELETE/PATCH/GET `/posts/{id}`, GET `/posts/user/{id}`, GET `/posts/search`
- POST/DELETE `/posts/{id}/like`, POST `/posts/{id}/react`
- GET/POST `/posts/{id}/comments`, PATCH/DELETE `/posts/{post}/comments/{comment}`, POST `/posts/{post}/comments/{comment}/like` (referenced by frontend — **needs manual test confirming the comment-like endpoint actually exists in the backend; only 528–530 list `/{id}/react` not a per-comment like**)
- POST/DELETE `/posts/{id}/save`, POST `/posts/{id}/hide`
- GET `/posts/{id}/insights` (own-post insights)
- POST `/posts/{id}/report`
- GET `/posts/insight-data` — all data for insight-card builder (readiness, last session, nutrition, weekly load, diagnosis) — called

**Broken / partial:** `POST /posts/{postId}/react` uses `reaction_type` as a query param. Functional but non-idiomatic.
**Missing from spec:** Pin/archive — `is_pinned`/`is_archived` columns exist but no dedicated endpoints; presumably via generic PATCH. "Not Interested" is the hide endpoint.

### Feed
**Files:** `app/routers/feed.py`
**Endpoints:** GET `/feed` with filter=`all|following|clubs|workouts|insights|recaps` — called.
**Notes:** Records post views. Returns `following_count`. Fine.

### Follows
**Endpoints:** POST/DELETE `/social/follow/{id}`, GET `/social/followers`, `/social/following`, `/social/followers/{id}`, `/social/following/{id}`, `/social/suggestions`, `/social/search` — all called

### Clubs
**Files:** `app/routers/clubs.py`
**Endpoints:** GET `/clubs`, `/clubs/mine`, `/clubs/{id}`, POST `/clubs/{id}/join`, DELETE `/clubs/{id}/leave`, GET `/clubs/{id}/leaderboard`, POST `/clubs/auto-join` — all called
**Data:** 8 default clubs seeded on startup (matches spec).
**Missing from spec:** "Last week top 3" — not verified in query. Needs manual testing.

### Stories
**Files:** `app/routers/stories.py`
**Endpoints:** POST `/stories`, GET `/stories/feed`, GET `/stories/my`, GET `/stories/{id}`, DELETE `/stories/{id}` — all called
**Data:** 24-hour expiry lazily enforced on feed fetch.
**Missing from spec:** **Close friends list — no backend support found.** No `close_friends` table/column. Story "Close Friends" button in spec is unbacked.

### Highlights
**Files:** `app/routers/highlights.py`, `app/models/highlight.py`
**Endpoints:** CRUD + reorder + stories + stats — all called
**Risk:** `highlight` model is NOT listed in `main.py` model-import block (lines 14–48). If never transitively imported, its table won't be auto-created by `create_all`. **Needs manual testing** in a fresh DB.

### Daily check-in
**Files:** `app/routers/checkin.py`, `app/models/daily_checkin.py`
**Endpoints:** GET `/checkin/today`, POST `/checkin`, DELETE `/checkin/today`, POST `/checkin/caption` — all called
**Notes:** Distinct from wellness check-in — confusing name collision.

### Messages (DMs)
**Files:** `app/routers/messages.py` (718 lines)
**Implementation status:** complete — full 1:1 DMs with conversations, read tracking, mute, archive, requests, unread count, dm-candidates, privacy gate (mutuals/everyone/following).
**Endpoints:** many — all called
**Notes:** `dm_privacy` column is added via raw SQL only (NOT in User model).

### Media upload
**Files:** `app/routers/media.py`
**Implementation status:** **partial**
**Broken / partial:**
- `boto3` and `Pillow` imported in try/except — **neither in `requirements.txt`**. Without them, falls back to base64 data URLs — unusable in prod (huge payloads stuffed into DB/posts).
- Endpoint authed. No MIME/size limits.
**Launch blocker** unless S3/R2 is configured AND `boto3`+`Pillow` added before production deploy.

---

## API Surface — Orphan / Unused Endpoints

Backend routes that do NOT appear in `armen/mobile/services/api.ts`:
- `POST /activities/regenerate-autopsies` — **orphan / unused by mobile.**
- `GET /posts/search` — **likely orphan.**
- `PUT /auth/profile` — duplicates PATCH endpoint; legacy.

Every other backend route is called by the mobile app.

---

## Database Schema

### Approach
- Tables created via `Base.metadata.create_all()` in lifespan.
- Column additions via raw `ALTER TABLE ... IF NOT EXISTS` in `main.py::_USER_COLUMN_MIGRATIONS` (~140 statements).
- Dedup SQL inline for meal_plans / rest days.
- **No Alembic migrations folder in use** despite the dep being listed.

### Schema drift (ORM model vs real DB)
Columns added via raw SQL that are **missing from the SQLAlchemy model**:
- `users.is_private`, `users.checkin_streak`, `users.dm_privacy` — read-only via `getattr`; ORM writes won't persist.
- Several micronutrient columns on `foods_cache` / `custom_foods` / `nutrition_logs` / `daily_nutrition_summaries` — did not verify each model has them. Needs manual cross-check.
- `post_reports` raw SQL uses TEXT columns (reporter_user_id, reported_post_id) while `PostReport` model probably uses UUID FKs. Potential type mismatch.

### Tables with no code reference
All tables registered in `main.py` are referenced. No obvious dead tables.

### Relationship integrity
- CASCADE deletes generally correct.
- `stories.source_post_id` FK migrated to `ON DELETE SET NULL` inline — good.
- `Highlight` model is NOT in `main.py` import block — risk the table isn't auto-created on fresh DB; migration SQL doesn't explicitly CREATE it either.

### Indexes
Reasonable indexes on hot paths (feed, stories, posts_likes, post_views, messages, social_follows, weight_logs). 👍

---

## Integrations Status

| Integration | OAuth/Auth | Data pulled | Stored | Used downstream |
|---|---|---|---|---|
| **Strava** | ✅ OAuth + refresh | ✅ 20 recent activities on sync | ✅ `activities` | Display only; **does NOT feed training_load / readiness** |
| **Apple HealthKit** | N/A — mobile pushes | ✅ sleep, HRV, RHR, steps, active kcal | ✅ `health_snapshots` | ✅ Readiness sleep, diagnosis, home |
| **Hevy** | API key | ✅ Full pagination | ✅ `hevy_workouts` + autopsy | Display only; **does NOT feed training_load / readiness** |
| **Whoop** | ✅ OAuth + refresh | ✅ 7 days recovery | ✅ `whoop_data` | ✅ Diagnosis prompt only, **NOT** readiness (hardware slot reports `whoop=False`) |
| **Oura** | ✅ OAuth + refresh | ✅ readiness + sleep merged | ✅ `oura_data` | ✅ Diagnosis prompt only, **NOT** readiness (hardware slot reports `oura=False`) |
| **Open Food Facts** | None needed | ✅ search + barcode | ✅ `foods_cache` + `search_cache` | ✅ Food search |
| **USDA FDC** | Optional API key | ✅ search | ✅ Same caches | ✅ Food search |
| **OpenAI (GPT-4o-mini)** | Key in .env | ✅ all AI calls | ✅ persisted on diagnosis/autopsy/mealplan tables | ✅ |
| **Anthropic (Claude)** | Key in .env | ❌ **Unused** — client declared, never called | — | — |

**Finding:** The `anthropic` import + `_client` in `claude_service.py` is dead code. `MODEL = "claude-sonnet-4-20250514"` and `HAIKU_MODEL = "claude-haiku-4-5-20251001"` constants are defined but unused. Function names (`generate_hevy_autopsy`, `_sync_generate_workout_autopsy`) and log messages refer to "Claude" but actually call OpenAI. Rename for clarity; remove anthropic dep.

**Finding:** Strava / Hevy / Whoop / Oura workouts don't contribute to training_load — only `UserActivity` does. An athlete who tracks mostly via Strava/Hevy will have `training_load` component missing from readiness and lose 35% of signal weight (forcibly redistributed).

---

## AI Systems

| System | Prompt | OpenAI call | Caching | Rate limit | Rendered |
|---|---|---|---|---|---|
| Daily diagnosis (`/home/diagnosis`) | ✅ | ✅ gpt-4o-mini | ✅ `Diagnosis` table, 1h on force | implicit via cache | ✅ |
| Daily diagnosis (`/diagnosis/daily`) | ✅ | ✅ gpt-4o-mini (via claude_service) | **❌ No caching** | ❌ | ✅ |
| Workout autopsy (Strava) | ✅ | ✅ | ✅ persisted on `activities.autopsy_text` | ❌ | ✅ |
| Activity autopsy (manual) | ✅ | ✅ | ✅ persisted on `user_activities.autopsy_text` | ❌ | ✅ |
| Hevy autopsy | ✅ | ✅ | ✅ persisted on `hevy_workouts.autopsy_text` | ❌ | ✅ |
| Meal plan generation | ✅ full system prompt + JSON schema | ✅ gpt-4o-mini (AsyncOpenAI inline in meal_plan.py) | ✅ `meal_plans` unique(user,date), regeneration_count | **⚠ Spec says 1/hr regen limit — COMMENTED OUT** | ✅ |
| Nutrition assistant | ✅ detailed with meal-modification block | ✅ | N/A (chat) | ✅ 20 msg/day **(in-memory dict; resets on restart, not worker-shared)** | ✅ |
| Food photo scanning | ✅ JSON with full micro schema | ✅ gpt-4o-mini vision | Not cached (unique per scan) | ❌ | ✅ |

---

## Readiness score — final verdict

See "Readiness score" section above. Implementation is spec-faithful. Caveats:

1. `_get_hardware_status` hardcodes `whoop=False`, `oura=False` — Whoop HRV/RHR and Oura HRV are stored but never consumed by readiness components. Spec says hardware slots "auto-incorporated" when connected; this is not true today.
2. `"Rest Recommended"` label (<40) vs spec "Rest". Cosmetic.
3. `"High/Medium/Low/Directional Confidence"` suffixes vs spec bare "High/Medium/Low/Directional". Cosmetic.

---

## Launch blockers (critical for June 23)

1. **Meal-plan regeneration rate limit is disabled** in `meal_plan.py` (commented out). Unlimited OpenAI hits per user. Re-enable before launch.
2. **Media uploads will fall back to base64 data URLs** unless `boto3`+`Pillow` are installed. Neither is in `requirements.txt`. Configure S3/R2 AND add deps. Without this: social photos, stories, avatars all broken or bloated into DB.
3. **CORS wide open** (`allow_origins=["*"]`). Lock to production origins before launch.
4. **`.env` committed to the repo tree.** Rotate all keys (OpenAI, Anthropic, Strava, Whoop, Oura, AWS, SECRET_KEY) before public deploy.
5. **User model schema drift** — `is_private`, `dm_privacy`, `checkin_streak` only exist in DB. Private accounts, DM privacy settings, and streak display will silently fail on any ORM-based write path. Add to `User` model or stop using ORM for those fields.
6. **No real migration system.** `create_all` + 100+ raw SQL `ALTER` statements on startup is fragile. One failed statement blocks lifespan. Move to Alembic or accept the risk.
7. **Strava / Hevy / Whoop / Oura imports don't drive training load.** If users primarily track via Strava or Hevy, readiness reports "Low Confidence" with training_load excluded. Fold into readiness calc or move load source to also read from those tables.
8. **Meal plan AI failure paths** — malformed JSON from OpenAI → 500. No defensive parse/retry. Same on `/home/diagnosis` and food scanning (scanning has fallback; meal plan doesn't).
9. **`_assistant_rate` in-memory** — 20 msg/day limit resets on every worker restart; doesn't enforce across workers. Users can bypass by getting routed to a cold worker.
10. **Highlights table may not auto-create** (model not in `main.py` import block). Needs manual test on a fresh DB.
11. **`_require_anthropic_key()` on `/diagnosis/daily`** while call uses OpenAI — endpoint 503s if ANTHROPIC_API_KEY is absent but OpenAI works. Remove guard or switch guard to OpenAI key.

## Launch polish (important but not critical)

1. Collapse 3 duplicate profile-update endpoints.
2. Collapse 2 daily-diagnosis implementations.
3. Move `_assistant_rate` to DB/Redis.
4. Rename `claude_service.py` → `ai_service.py`; drop unused `anthropic` import + `_client` + unused `MODEL`/`HAIKU_MODEL` constants.
5. Return real `recent_achievements` and personal-bests on public profile instead of `[]`.
6. Verify "last week top 3" in leaderboard.
7. Close-friends list for stories — no backend support.
8. Pydantic schemas on remaining `dict` POST bodies (save_meal, post creation partly).
9. Adopt Alembic; retire `_USER_COLUMN_MIGRATIONS`.
10. Reduce N+1 in `_build_post` / `_club_dict` via JOINs or batched queries.

## Post-launch (defer to v1.1+)

1. Fold Whoop + Oura HRV/RHR/sleep into readiness components (currently only Apple Health feeds readiness).
2. Group DMs (`conversations.type='direct'` column already there).
3. Push notifications.
4. Pin/archive post dedicated endpoints.
5. Story highlights auto-curation.
6. Refactor monolith routers (`home.py` 744, `meal_plan.py` 931, `posts.py` 863, `messages.py` 718).
7. Email verification + password reset.
8. Background job queue for AI calls (currently blocks worker threads).

---

## Concerns (security / architecture / performance)

### Security
- **CORS `*`** with `allow_methods=*`, `allow_headers=*`. Fine for dev, unsafe for prod.
- **`.env` is tracked in the tree** (`armen/backend/.env`). Rotate all keys.
- **JWT has no revocation** — logout is client-only. Acceptable for MVP.
- **`hevy_api_key` stored plaintext** on users table. Consider encrypting at rest.
- **Strava/Whoop/Oura tokens stored plaintext**, same.
- **`media.py` has no size or MIME limits** — arbitrary file type/size accepted.
- **`/auth/check-username` unauthenticated** — username enumeration. At minimum rate-limit.
- **No request rate limiting at all** (no slowapi, no nginx/Railway rules in config). Endpoints that cost money (OpenAI) are especially exposed.

### Architecture
- **Two DB-transaction patterns mixed**: `get_db` auto-commits; several routes also call `db.commit()` explicitly (hevy, user_activity, weight). Nested-transaction confusion risk.
- **No Alembic** in use despite dep.
- **No tests** — no `tests/` dir under backend.
- **Monolithic routers** — `posts.py` 863, `meal_plan.py` 931, `home.py` 744, `messages.py` 718.
- **No structured logging / correlation IDs.**
- **Single global engine, no read replicas** — fine for launch scale.

### Performance
- **Readiness calc loops 28 days Python-side** — O(N) per request, fine.
- **`/feed` writes a view row per post returned** — write amplification. Move to fire-and-forget/batched.
- **N+1 queries** in `_club_dict` and `_build_post` (per-post in a loop). 20 posts per page ~= 40+ extra SELECTs. Batch.
- **`food_search_service`** calls OFF + USDA serially, not in parallel.
- **OpenAI `asyncio.to_thread`** blocks a worker thread per request. Under load, hit concurrency ceiling quickly.

### Correctness / data integrity
- `UserActivity.is_rest_day` dedup keeps oldest (migration SQL); API-level dedup returns existing — good.
- Meal plan unique on (user, date) — enforced.
- Post likes unique (post, user) — enforced.
- `messages.extra_metadata` is `JSONB` in raw SQL but model probably `JSON` — cross-check.
- `sport_tags` JSON with no validation — type drift risk.

---

## Files touched during audit

Read-only. No backend code/config/schema modified. Only `audits/backend-audit-2026-04-20.md` (this file) was created/overwritten.
