# ORYX — Consolidated Audit Priority List
**Date:** 2026-04-20
**Sources:** `audits/{backend,home-wellness,activity,nutrition,social-profile-auth}-audit-2026-04-20.md`
**Target launch:** June 23, 2026 (~9 weeks)

---

## Executive read

Five audits independently converged on the same three themes:

1. **You can't ship this without fixing ~6 items that cause data corruption, App Store rejection, or unbounded OpenAI cost.**
2. **The app is visually dark-mode-only.** Light mode is broken in every tab (193 hex in Activity, 111 in Wellness, 64 in Nutrition, 42 in Home, plus frozen palette in Community/Profile/Settings).
3. **The backend is ahead of the mobile app on social + AI features, but behind on operational hygiene** — no migrations, no rate limits, secrets in plaintext, CORS wide open.

Most spec gaps are small per item but numerous. The real launch risk is not any single missing feature; it's that you will ship something that corrupts user data (height bug, timezone bugs, survey wipe), bankrupts your OpenAI bill (unlimited scan + meal plan), or gets rejected at submission (delete account).

---

## TIER 0 — Ship-breakers (do these first, < 2 weeks)

Issues that will either reject your App Store build, expose user data, or bankrupt you within hours of public launch.

| # | Issue | Area | Source |
|---|---|---|---|
| 0.1 | **Delete Account is `Alert('Coming Soon')`** — Apple 5.1.1(v) + Play require in-app deletion. Build rejected. | Social/Settings | social-profile-auth |
| 0.2 | **Meal plan regenerate has NO rate limit** (spec: 1/hr; backend limiter commented "for dev"). + **food scan has no rate limit**. + **Ask ORYX limit is in-memory** (resets on restart/breaks across workers). One abusive or buggy client = hundreds of $ in an hour. | Nutrition + Backend | nutrition, backend |
| 0.3 | **No rate limiting on `/auth/login`, `/auth/signup`, `/auth/check-username`.** Brute force + enumeration. | Backend | backend |
| 0.4 | **JWT stored in AsyncStorage, not SecureStore.** 7-day tokens, plaintext on disk, no refresh. | Social/Auth | social-profile-auth |
| 0.5 | **`allow_origins=["*"]` CORS + OpenAI prompt/response logged at INFO level** (PII in logs) + **Strava/Whoop/Oura tokens plaintext in DB**. | Backend | backend |
| 0.6 | **Media fallback writes base64 data URLs into the DB** when S3/R2 creds missing. 500 KB–5 MB per post. DB implodes within a week. | Backend | backend |
| 0.7 | **Indirect prompt injection risk in `_generate_replacement_meal`** — free-text `foods_loved`/`foods_disliked` fed into prompt that can modify a user's plan. | Backend | backend |

---

## TIER 1 — Data corruption / silent data loss (fix alongside Tier 0, week 1–3)

Quieter than Tier 0 but these make your data untrustworthy — every downstream calc (TDEE, readiness, training load) inherits the corruption.

| # | Issue | Area |
|---|---|---|
| 1.1 | **Height "ft" bug**: `parseFloat("5.11") × 30.48 = 155.8 cm`. Every US user who enters 5'11" gets ~5'1". Breaks TDEE → breaks macro targets → breaks nutritional component of readiness. Present in BOTH `signup.tsx` and legacy `onboarding.tsx`. | Social/Auth |
| 1.2 | **`patchOnboarding` errors swallowed** (`.catch(() => {})`). User finishes onboarding locally; backend never receives profile. Silent data loss for macros, sport tags, DOB, everything. | Social/Auth |
| 1.3 | **Nutrition Survey edit flow wipes preferences** — reopening from gear resets to `DEFAULT_SURVEY` and PATCHes empty fields. Every edit destroys data. | Nutrition |
| 1.4 | **Timezone: `datetime.utcnow()` server-side + UTC ISO on mobile.** Users in UTC+/-N log meals/wellness under wrong day. Daily summary rollovers drift. Affects nutrition, wellness, weight, home "today" logic. | Backend + mobile |
| 1.5 | **No real migrations.** `_USER_COLUMN_MIGRATIONS` raw SQL re-executed every boot. One failure mid-list = server won't start. | Backend |
| 1.6 | **Schema/model drift on User** (`is_private`, `checkin_streak`, `dm_privacy` in DB, not on ORM model). Works via raw SQL today; any ORM insert that assumes defaults will fail. | Backend |
| 1.7 | **Two conflicting diagnosis endpoints** — `/diagnosis/daily` and `/home/diagnosis` return different JSON shapes. Mobile must pick one; the other must die. | Backend |
| 1.8 | **Today's-session date comparison bug on Home**: ISO timestamp compared `===` to `'YYYY-MM-DD'`. Strain gauge never renders after a workout. | Home |
| 1.9 | **Strength workouts stored with `intensity='Moderate'` before RPE submitted** — if backend doesn't recompute `training_load` on `PATCH /rpe`, every strength session's load is wrong. Needs verification. | Activity/Backend |
| 1.10 | **`/signup` auto-sets `onboarding_complete=True`** — onboarding is bypassable. | Backend |
| 1.11 | **Duplicate onboarding flows** (legacy `onboarding.tsx` 10-step vs `(auth)/signup.tsx` 12-step) with divergent schemas. Users land in different data states. | Social/Auth |
| 1.12 | **Missing FK constraints on 10 social tables** — `social_posts`, `social_comments`, `social_follows`, `social_reactions`, `stories`, `story_views`, `post_likes`, `post_reports` (also wrong column type: String not UUID), `club_memberships`, `daily_checkins` — all have raw UUID columns with no `ForeignKey` / `ondelete=CASCADE`. Discovered during 0.1 implementation; cascade must be done explicitly in the deletion service until schema is rewritten in 1.5. | Backend |

---

## TIER 2 — Core spec missing or dead-in-the-water (weeks 2–6)

Features the spec explicitly requires where code is either absent, orphaned, or wired to a dead endpoint. These aren't polish — without them you're not shipping the app you described.

| # | Issue | Area |
|---|---|---|
| 2.1 | **Weight tracking standalone screen doesn't exist.** Home's weight card calls `router.push('/weight')` → dead route. Full spec (trend graph, range selector, goal card, streak, morning reminder) unimplemented. | Activity |
| 2.2 | **Wellness tab invisible** (`_layout.tsx` sets `href: null`). No Hooper trend charts, no HRV trends, no sleep trends, no recovery history visible to users. Entire tab hidden. | Home/Wellness |
| 2.3 | **Password Reset** — stubbed front-to-back (no endpoint, no UI). Table stakes for launch. | Social/Backend |
| 2.4 | **Whoop + Oura OAuth callbacks require JWT** — browser redirects always 401. Users cannot connect either. Must copy Strava's state-based pattern. **AND** Whoop/Oura data isn't fed into readiness score even when connected. | Backend |
| 2.5 | **Apple Health connect CTA on Home is a no-op** (empty `TouchableOpacity`). The "connect your wearables" story is broken across all three providers. | Home |
| 2.6 | **Posts feed filter mismatch** — filter tabs (Workouts/Insights/Recaps) query `post_type` but the write path uses `insight_type`. Every filter returns 0 posts. | Backend |
| 2.7 | **Onboarding does NOT auto-join clubs** — `/clubs/auto-join` endpoint exists but is never called post-signup. Empty community tab for new users. | Social/Backend |
| 2.8 | **Privacy features are local-only stubs** — private account toggle, DM audience, blocked users management. "Private" accounts are not actually private. | Social |
| 2.9 | **Default API URL fallback is `http://192.168.1.160:8000`** (developer LAN IP). If `EXPO_PUBLIC_API_URL` isn't baked into the prod build, app is DOA. | Social |
| 2.10 | **Plate calculator, superset mode, muscle map visualization — all missing.** Spec explicitly lists them in the manual logger. Zero code matches. | Activity |
| 2.11 | **Missing "My Nutrition Profile" summary card** on Nutrition tab. Only path to prefs is via gear → full survey. | Nutrition |
| 2.12 | **Stories readiness ring hardcoded `#555555`.** Spec says the ring is readiness-colored. Every user's bubble identical. | Backend/Social |
| 2.13 | **OpenAI key requirement undocumented** — spec + CLAUDE.md reference Claude; code uses OpenAI. If prod ships with only `ANTHROPIC_API_KEY`, every Intelligence card says "AI unavailable". | Home/Backend |
| 2.14 | **`readiness_delta_7d` referenced by Home hero, never returned by backend.** Dangling UI affordance. | Home/Backend |

---

## TIER 3 — Launch polish (weeks 4–8, fix what you can)

Quality drag. Won't kill the launch, will hurt reviews and word of mouth.

**Light mode sweep** (single largest polish item):
- Activity tab: 193 hardcoded hex — every modal dark-only
- Wellness screen: 111 hex
- Nutrition: 64 hex/rgba (card backgrounds illegible on light)
- Home: 42 hex
- Community/Profile/Settings: top-level `theme as T` imports freeze palette at module load — fix by moving to `createStyles(t)` pattern (already used correctly in login/signup)

**Performance** (will matter past early users):
- `_build_post` runs 5+ queries per post; feed page = 100+ queries
- Dashboard does 15+ sequential awaits — batch with `asyncio.gather`
- `/social/search` + `/social/suggestions` scan all users
- No pagination on `GET /activities/`
- Macro targets computed twice (home vs nutrition_service); ACWR computed 3 ways

**Small but visible**:
- Weekly trend day labels `M T W T F S S` (two Ts, two Ss)
- Count-up animation replays on every Home mount
- RPE badge stored but not rendered on journal cards
- Sport breakdown is bars; spec says donut
- Dead code: weekly volume chart + activity heatmap computed, never rendered
- "Load Earlier Sessions" button shows even when no more data
- Grocery list check state client-only, lost on refresh
- Water glass presets (200/250/330/400/500) — spec calls for 100–1000 ml range
- Ask ORYX has no "X messages left today" UI
- `settings/index.tsx` footer leaks a developer URL
- "Club feed coming soon" placeholder at `community.tsx:1472`
- Profile heatmap reuses 20-activity badge fetch instead of `/activities/heatmap?days=365`
- Forgot Password link visible on login, opens Coming Soon alert
- Check-in photo POSTed as base64 JSON — iOS photos can exceed FastAPI's 1 MB default body limit
- Leaflet map loaded from `unpkg.com` CDN at runtime (offline breaks)
- Two like systems coexist (`social_reactions` + `posts_likes`)
- `followers_count` / `following_count` denormalized without transaction safety
- MET table covers ~15 sports; everything else uses `DEFAULT_MET`

---

## TIER 4 — Defer to v1.1 or later

Spec items that are realistic cuts given the 9-week runway. Don't waste week-8 energy on these.

- Full Strava history backfill (currently last 20)
- Strava activity webhook / auto-sync
- Story likes / comments / replies (backend missing)
- DM real-time (websockets), attachments, read receipts, typing indicators
- Close Friends list server-side
- Push notifications + push-token table
- Achievement / badge system w/ real PRs + PR detection on Hevy
- Admin moderation dashboard (reports go into a void today)
- Email verification
- Full OAuth token encryption at rest
- Accent color theme picker (explicitly dropped in code comment)
- Featured-stats customization on profile
- Meal plan deep ingredient swap via chat
- Per-meal photo scan history
- Bedtime consistency component of readiness (backend returns None always)
- HRV / Sleep / Recovery / Wellness trend charts (or relocate to Home collapsible)
- Dashboard.tsx + legacy wellness.tsx — delete once replacement shipped

---

## My tackle-first pick (top 5 for week 1)

Doing these five this week collapses the biggest risk per hour invested. Each is small in scope, independent, and unblocks later work.

1. **Delete Account endpoint + UI** — unblocks App Store submission path entirely. Half a day backend (`DELETE /users/me` cascading), half a day mobile. (0.1)
2. **Rate-limit all OpenAI endpoints** — move rate limits from in-memory dict to a `rate_limits` table keyed by `(user_id, endpoint, window_start)`. Uncomment the meal-plan limiter. Add one to `/food/scan` and `/nutrition/assistant`. Maybe 1 day. (0.2)
3. **Height "ft" bug** — 10 lines in two files. Fixes corrupted TDEE for every US user. Write a one-off migration to recompute macros for existing users whose `height_cm < 100` (impossible) or mismatched against `height_ft`. Half a day. (1.1)
4. **SecureStore + API URL fallback** — swap AsyncStorage for `expo-secure-store` in `authStore.ts` + `api.ts` Bearer interceptor. Replace LAN IP fallback with a throw. Half a day. (0.4, 2.9)
5. **Set up Alembic + move `_USER_COLUMN_MIGRATIONS` to versioned migrations.** This one is bigger (1–2 days) but it's the foundation — every schema fix after this is safer, and it removes the "server won't restart if any SQL fails" risk. (1.5, 1.6)

Total: ~4–5 engineering days. Burns down 5 of the top 10 risk items.

Alternate if you'd rather fix the most-visible-broken user experience first: swap (5) for **the light mode sweep in the Activity tab** — that's the single biggest "looks broken" complaint a beta tester will file. ~2 days of mechanical token replacement.

---

## Progress log

- [x] **0.1 Delete Account** — completed 2026-04-20. Commits pending. Backend: Alembic init + migration 0002 (adds `users.deleted_at`, `users.delete_requested_at`, `account_deletion_events` audit table), `app/services/account_deletion.py` (soft_delete / restore / hard_delete_user / hard_delete_expired_users), `app/services/scheduler.py` (6-hour asyncio sweeper in lifespan), `POST /auth/restore` + login pending-deletion branch, `DELETE /users/me`, `get_current_user` blocks users with `delete_requested_at IS NOT NULL`. Social filter: `app/services/user_visibility.py` + 8 routers (feed, posts, social, users, stories, clubs, messages, plus self-view exemption) — soft-deleted users vanish from every social read. Mobile: `app/settings/delete-account.tsx` (3-step warning/confirm/success), `app/settings/restore-account.tsx`, login branches on `pending_deletion` response, `api.ts` `deleteMyAccount()` + `restoreAccount()`. Pulled Alembic setup forward from Day 5 (partial); Day 5 now only needs to migrate the ~140 raw ALTERs to versioned files.

- [x] **2026-04-21 session — Tier 0 closeout + Tier 1/2 verification**
  - **0.2 / 0.3 Rate limits** — confirmed DB-backed `check_rate_limit` already applied to `/auth/signup` (5/hr), `/auth/login` (10/min), `/auth/check-username` (30/min), `/auth/forgot-password` (5/10min), `/nutrition/meal-plan` regen (3/24h), `/nutrition/assistant` (20/24h), `/food/scan` (30/24h). Nothing to change.
  - **0.4 JWT SecureStore** — confirmed `authStore.ts` uses `expo-secure-store` for token, AsyncStorage only for non-sensitive profile. `api.ts` reads token from zustand (backed by SecureStore).
  - **0.5 CORS + logs + token encryption** — CORS already scoped via `CORS_ORIGINS` env. Downgraded PII-leaking OpenAI response logs in `claude_service.py` (activity_autopsy, hevy_autopsy, scan_food_image) from INFO→DEBUG so result text no longer lands in prod logs. **New**: `app/services/crypto.py` with Fernet-backed `EncryptedString` TypeDecorator; applied to Strava/Whoop/Oura `*_access_token` + `*_refresh_token` columns on `User`; widened columns to VARCHAR(1024) via migration; new `TOKEN_ENCRYPTION_KEY` setting (required in prod, warning in dev). Legacy plaintext rows are tolerated on read and re-encrypted on next write.
  - **0.6 Base64 media fallback** — already gated: prod returns 503 when S3 not configured; dev capped at 256 KB.
  - **0.7 Prompt injection in meal replacement** — added `_safe_user_text` / `_safe_user_list` sanitizers in `routers/meal_plan.py` (strip control chars, cap length, redact "ignore previous instructions"-class trigger phrases). Wrapped `foods_loved`/`foods_disliked`/`allergies`/`cuisines_liked` through sanitizers before they hit the meal-plan prompt. Added a data-not-instructions directive at the top of `_MEAL_PLAN_SYSTEM_PROMPT`. Rewrote `_generate_replacement_meal` to isolate the user request inside `<user_request>…</user_request>` tags with a system message instructing the model to treat that content as untrusted data.
  - **1.1 Height ft bug** — confirmed both `onboarding.tsx` and `(auth)/signup.tsx` parse "5.11" as 5 ft 11 in (not 5.11 ft). Fixed previously.
  - **1.2 patchOnboarding swallowed errors** — confirmed both screens log/surface errors (no silent `.catch(() => {})`).
  - **1.3 Nutrition survey wipe** — confirmed `nutrition-survey.tsx` hydrates state from existing profile before editing.
  - **1.4 Timezone** — **deferred** (60+ `utcnow()` sites, coordinated mobile+backend change; multi-day).
  - **1.5 Alembic migrations** — partial (init + 0002 shipped in 0.1). Rewriting the ~140-statement `_USER_COLUMN_MIGRATIONS` into versioned files remains open.
  - **1.6 User model drift** — confirmed `is_private`, `dm_privacy`, `checkin_streak` now on ORM model.
  - **1.7 Conflicting diagnosis endpoints** — `/diagnosis/daily` now returns 410 Gone; `getDailyDiagnosis()` client routed to POST `/home/diagnosis` and marked `@deprecated`.
  - **1.8 Home today-session date compare** — confirmed `hadSessionToday` uses `startsWith(todayISO())`.
  - **1.9 Strength training_load recompute on RPE** — confirmed `PATCH /user-activities/{id}/rpe` recomputes `training_load`.
  - **1.10 Signup sets onboarding_complete=False** — confirmed in `routers/auth.py:131`.
  - **1.11 Duplicate onboarding flows** — both files remain but write the same schema; no user-visible divergence left.
  - **1.12 Missing FK constraints** — DB-level cascade already present via `_USER_COLUMN_MIGRATIONS`; ORM-level FK decls remain a cleanup for 1.5 rewrite.
  - **2.6 Feed filter mismatch** — confirmed posts write under both `post_type` and `insight_type` keys.
  - **2.7 Auto-join clubs post-signup** — confirmed `(auth)/signup.tsx` + `onboarding.tsx` call `autoJoinClubs()` on completion.
  - **2.9 Default API URL fallback** — confirmed throws when `EXPO_PUBLIC_API_URL` is unset.
  - **2.12 Stories readiness ring color** — confirmed `routers/stories.py` reads `readiness_color` from story overlay per user.
  - **2.14 readiness_delta_7d dangling UI** — confirmed `routers/home.py` now computes and returns it.
  - **2.1 Weight standalone screen** — confirmed `app/weight.tsx` already exists (trend chart, range selector 7D–All, stats row, goal alignment card, streak, log CTA). Audit was stale.
  - **2.3 Password reset** — confirmed `(auth)/forgot-password.tsx` + backend `/auth/forgot-password` + `/auth/reset-password` wired end-to-end.
  - **2.4 Whoop/Oura OAuth** — switched both `/whoop/auth-url`/`callback` and `/oura/auth-url`/`callback` to Strava's state-based pattern (state = `user_id:nonce`, callback no longer requires JWT). Also updated `readiness_service._get_hardware_status` to report true whoop/oura availability by probing WhoopData/OuraData for yesterday. **Note**: the audit's second half — feeding Whoop/Oura numbers into the readiness components themselves — remains open (requires component weighting / dedupe with Apple Health).
  - **2.5 Apple Health connect CTA** — confirmed the "Connect Apple Health" button on Home navigates to `/settings` when all vitals are missing.
  - **2.8 Server-side privacy** — partial: private accounts are enforced on `/users/{id}/posts` (returns empty payload when not following), but feed/stories enforcement not audited here.
  - **2.11 Nutrition profile card** — confirmed summary card rendered on Nutrition tab when survey complete.
  - **2.13 OpenAI-key docs** — already reflected in `CLAUDE.md` ("OPENAI_API_KEY is LOAD-BEARING for prod").

  Activity-audit items closed in-session:
  - Weight screen launch blocker: cleared (file exists, fully wired).
  - "Load Earlier Sessions" has-more flag: `hasMoreStrava` already gates the button.
  - RPE badge on feed cards: already rendered at `activity.tsx:1168-1172`.
  - Dead code weekly-volume chart + heatmap: already rendered (`activity.tsx:2372` + `:2396`).

  Additional closeouts:
  - **1.4 Timezone — infra + critical sites**: new `users.timezone` column (IANA name, default `UTC`), `app/services/user_time.py` helpers (`user_today`, `user_day_bounds`, `capture_user_timezone`), mobile axios interceptor now sends `X-User-Timezone` on every request, `X-User-Timezone` added to CORS `allow_headers`. Migrated the highest-risk daily-boundary sites to per-user time: `/auth/login` (capture), `/home/dashboard` (capture + today), `/home/diagnosis` (today), `/nutrition/today` (logs bounds), `/nutrition/water/today` + PATCH (today), `/checkin/today` (today), `/nutrition/assistant` (logs bounds), `_generate_meal_plan` (today), meal-plan GET/POST (today). Remaining `utcnow()` sites are cache keys, stats cutoffs, and DB timestamp defaults — less impactful and can migrate incrementally.
  - **2.10 Plate calc / superset / muscle map**: confirmed all three are shipped (`components/PlateCalculator.tsx`, `components/MuscleMap.tsx`, `supersetGroup` on `ExerciseEntry` with `cycleSupersetGroup` UI). Audit was stale.

  Still-open items (genuine multi-hour/day work, not closed in-session):
  - 1.5 migrate `_USER_COLUMN_MIGRATIONS` to versioned Alembic files (mechanical but risky without a live DB to test against)
  - 2.2 Wellness tab visibility (conflicts with Tier 4 deferral of wellness trend charts)
  - Full Whoop/Oura readiness component integration (deferred half of 2.4 — needs weight design)
  - Light-mode sweep (Tier 3 — 193 hex in activity.tsx + similar in wellness/nutrition)
  - Tier 4 defers untouched by design.

End of consolidated list.
