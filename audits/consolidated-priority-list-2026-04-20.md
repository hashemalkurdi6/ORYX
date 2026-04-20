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

End of consolidated list.
