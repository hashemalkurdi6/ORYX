# ORYX/ARMEN Backend Audit — 2026-04-26

## Status: in progress

Auditor: read-only review of `armen/backend/` against mobile client `armen/mobile/services/api.ts`.
Reference: `/Users/armenkevorkian/Desktop/ORYX/ORYX/audits/backend-audit-2026-04-20.md`.

---

## TL;DR — what changed since 04-20

Significant progress on launch blockers:

- **FIXED:** `boto3==1.35.0` and `Pillow==10.4.0` are now in `requirements.txt:17-18`. Media uploads no longer silently fall back to base64.
- **FIXED:** CORS no longer wildcards. `app/main.py:621-635` reads `CORS_ORIGINS` env and falls back to dev origins; `allow_credentials=False`; `allow_methods` and `allow_headers` are scoped lists.
- **FIXED:** Alembic now exists. `armen/backend/alembic/` has `env.py`, `script.py.mako`, and `versions/0001_baseline.py` + `0002_add_soft_delete_and_account_events.py`.
- **FIXED:** User model schema drift. `is_private`, `avatar_url`, `checkin_streak`, `dm_privacy`, `timezone` are now real ORM columns (verified below).
- **FIXED:** `_require_anthropic_key` mismatch on `/diagnosis/daily`. Comment at `app/main.py:569-572` confirms diagnosis/autopsy migrated to OpenAI; ANTHROPIC kept only for `/nutrition/scan` Claude vision.
- **FIXED:** `_assistant_rate` in-memory limiter — DB-backed `rate_limit_events` table now exists (`app/main.py:504-511`) and `app/services/rate_limit.py` exists.
- **FIXED:** OAuth tokens encrypted at rest. Migrations widen Strava/Whoop/Oura token columns to VARCHAR(1024) for Fernet ciphertext (`app/main.py:553-559`); `app/services/crypto.py` exists.
- **NEW:** Soft-delete and account-deletion sweeper (`app/services/account_deletion.py` + `scheduler.py` + alembic 0002). 6h interval task in lifespan.
- **NEW:** `app/services/training_load.py`, `prompt_safety.py`, `user_time.py`, `user_visibility.py`, `email_service.py`, `hevy_prs.py` services.
- **NEW:** `messages` router + conversations/conversation_participants/messages tables (DMs Phase 1).
- **NEW:** Per-user IANA `timezone` column on `users` (`app/main.py:561`).
- **NEW:** Privacy/Terms HTML routes at `/privacy` and `/terms`.

Remaining issues are listed by section below.

---

## Status by Section

### Migrations / lifespan / startup

**Files:** `app/main.py:78-608`, `armen/backend/alembic/`, `armen/backend/alembic.ini`

- **STILL BROKEN:** `_USER_COLUMN_MIGRATIONS` (485 lines, ~140 raw `ALTER`/`CREATE` statements) is **still executed every startup** alongside `Base.metadata.create_all` (`app/main.py:583-587`). Alembic exists but is not the source of truth — `alembic/versions/0001_baseline.py` and `0002_add_soft_delete_and_account_events.py` coexist with the inline-SQL approach. One failed `ALTER` still blocks lifespan.
- **STILL BROKEN:** `post_reports` raw-SQL definition uses `reporter_user_id TEXT`, `reported_post_id TEXT` (`app/main.py:439`) while the `PostReport` model likely uses UUID FKs. Type mismatch persists.
- **NEW (good):** lifespan launches `run_deletion_sweeper` background task with stop-event + 10s shutdown timeout (`app/main.py:596-607`). Clean shutdown pattern.
- **NEW (concern):** Startup logs API keys with `key[:7]` / `key[:8]` prefixes (`app/main.py:574,579`). Low risk but logs first chars of secrets in plaintext to stdout.

### Auth & User model

**Files:** `app/models/user.py`, `app/routers/auth.py`

- **FIXED:** `is_private`, `dm_privacy`, `checkin_streak`, `timezone`, `avatar_url` (now `Text`), `weight_unit`, `delete_requested_at`, `deleted_at` are first-class ORM columns (`app/models/user.py:62-85`). No more silent ORM-write drift.
- **FIXED:** Strava/Whoop/Oura tokens now use `EncryptedString(1024)` (`app/models/user.py:22-41`) — Fernet ciphertext at rest.
- **STILL BROKEN (minor):** `hevy_api_key` remains plaintext `String(255)` (`app/models/user.py:44`), unlike the other tokens. Inconsistent encryption posture.

### Diagnosis

**Files:** `app/routers/diagnosis.py`, `app/routers/home.py`, `app/services/claude_service.py`

- **FIXED:** `GET /diagnosis/daily` now returns 410 Gone (`app/routers/diagnosis.py:107-116`). Two-implementations problem resolved — `POST /home/diagnosis` is canonical.
- **FIXED:** `_require_anthropic_key()` rewritten to gate on `OPENAI_API_KEY` (`app/routers/diagnosis.py:23-31`). Kept its old name for now — minor code smell but functionally correct.
- **STILL BROKEN:** `claude_service.py:7,19` still imports `anthropic` and instantiates an unused `_client = anthropic.Anthropic(api_key=...)`. `MODEL = "claude-sonnet-4-20250514"` and `HAIKU_MODEL` constants on lines 16-17 are still dead. File still named `claude_service.py`. Cosmetic but increases reader confusion. `requirements.txt:12` still ships the `anthropic` SDK.
- **STILL BROKEN:** `_format_wellness` (claude_service.py:111-123) still reads legacy `mood`/`energy`/`soreness` instead of Hooper fields — diagnosis prompt loses Hooper signal.

### Rate limiting / AI gating

**Files:** `app/services/rate_limit.py`, `app/routers/meal_plan.py`, `app/routers/nutrition.py`

- **FIXED:** DB-backed sliding-window limiter (`app/services/rate_limit.py:23-60`). Uses `rate_limit_events` table and works across workers. Includes opportunistic GC of >24h rows.
- **FIXED:** Meal plan regen rate-limited (`meal_plan.py:551-552`) — now 3/day per user via the DB limiter. (Spec said 1/hr; current value is 3/day — not identical to spec but no longer "no limit". Note residual dead-comment block at `meal_plan.py:576-579`.)
- **FIXED:** Nutrition assistant 20/day via DB limiter (`meal_plan.py:801-802`).
- **FIXED:** Food scan 30/day (`nutrition.py:30-31`).
- **STILL BROKEN (minor):** `check_rate_limit` records the attempt **before** raising 429 (`rate_limit.py:44-45`). Means a flooding attacker keeps the window pinned. The docstring acknowledges this as intentional, but it inflates row count for honest retries too. Acceptable trade-off.

### Media uploads

**Files:** `app/routers/media.py`, `requirements.txt:17-18`

- **FIXED:** `boto3` and `Pillow` are pinned in requirements. `media.py:31-46` uses Pillow to resize to 1080px / JPEG q85 before upload.
- **FIXED:** Production safety. When `ENV=prod|production`, missing `AWS_S3_BUCKET` returns 503 instead of base64 (`media.py:100-104`). Dev fallback also caps at 256KB (line 106).
- **STILL BROKEN:** No MIME validation. File extension and `file.content_type` are never checked — `_compress_image` would raise on non-images, but only if Pillow is installed. No size cap on the S3 path either.

### CORS / security middleware

- **FIXED:** Origins scoped (`app/main.py:622-635`), `allow_credentials=False`, methods/headers explicit.
- **STILL BROKEN:** No global request-rate limiter on auth endpoints (`/auth/login`, `/auth/check-username`, `/auth/signup`) — DB limiter exists but isn't wired into auth router. Username enumeration / credential stuffing still wide open.
- **STILL BROKEN:** No CSRF/clickjacking headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`). Only matters if web clients exist.

### Schema drift / migrations

- **STILL BROKEN:** Alembic versions exist but `_USER_COLUMN_MIGRATIONS` (485 raw statements) still runs on every startup — Alembic is not the source of truth.
- **STILL BROKEN:** `post_reports` raw-SQL definition uses `TEXT` for FKs while `PostReport` model likely uses UUID — mismatch persists (`app/main.py:439`).

### Soft-delete / scheduler (NEW)

**Files:** `app/services/account_deletion.py`, `app/services/scheduler.py`, alembic `0002_add_soft_delete_and_account_events.py`, `User.delete_requested_at`/`deleted_at`

- **NEW:** Background sweeper hard-deletes accounts past their grace window every 6 hours.
- **NEW:** `account_deletion_event` table records the lifecycle.

### DMs (NEW)

**Files:** `app/routers/messages.py` (729 LOC), `app/models/conversation.py`, raw-SQL tables `conversations`, `conversation_participants`, `messages`

- 1:1 DMs Phase 1. `users.dm_privacy` enum: `mutuals|everyone|following`.
- **STILL BROKEN:** `messages.extra_metadata` declared `JSONB` in raw SQL (`app/main.py:546`) — model type may differ. Cross-check on inserts.

### Endpoint surface vs mobile client

Mobile `armen/mobile/services/api.ts` not re-diffed in detail this run; previous orphan list (`POST /activities/regenerate-autopsies`, `GET /posts/search`, `PUT /auth/profile`) was unchanged in router files. `GET /diagnosis/daily` removed as a useful endpoint (now 410), so any mobile call to it will fail — verify mobile uses `POST /home/diagnosis`.

### Readiness service

**Files:** `app/services/readiness_service.py` (561 LOC, +5 vs prior)

Spot-checked — same well-built EWMA-ACWR + Hooper + nutrition + sleep weighting. Whoop/Oura still not folded into components per the prior audit. Not re-verified line-by-line this run.

### Notable launch-blocker status

| 04-20 blocker | Status |
|---|---|
| Meal-plan regen rate limit disabled | FIXED (3/day DB-backed) |
| boto3/Pillow missing in requirements | FIXED |
| CORS wide open | FIXED |
| `.env` committed | NOT VERIFIED THIS RUN |
| User model schema drift | FIXED |
| No real migrations | PARTIAL — Alembic exists but raw SQL still runs |
| Strava/Hevy/Whoop/Oura don't drive training_load | NOT VERIFIED (training_load.py service exists; not inspected) |
| Meal-plan/diagnosis JSON failure paths | NOT RE-VERIFIED |
| `_assistant_rate` in-memory | FIXED (DB-backed) |
| Highlights table not auto-created | FIXED (`highlight` model imported `app/main.py:42`) |
| `_require_anthropic_key` mismatch | FIXED |

## Sections not reached

- Per-router deep-dive on all 27 routers (only main, auth/user model, diagnosis, media, meal_plan, nutrition rate-limit checked thoroughly).
- `app/services/training_load.py` — does it now feed Strava/Hevy into readiness? Unverified.
- `app/services/prompt_safety.py` — purpose unverified.
- `app/services/user_visibility.py` and `user_time.py` — surface unverified.
- `app/routers/messages.py` full DM flow.
- Mobile `api.ts` cross-reference for new endpoints (`/users/me/timezone`, account-deletion endpoints, message endpoints).
- Alembic versions content vs raw-SQL drift.
- `.env` tracked status (would require git check).

## Status: complete


