# ORYX — 9-Week App Store Execution Plan

I have a consolidated audit of the ORYX codebase at `audits/consolidated-priority-list-2026-04-20.md`. That document is authoritative. You will work through it in the order laid out below, one item at a time, with review gates between phases. Read that audit document now before doing anything else.

## Operating rules — read these first, they apply to every phase

**1. No new features.** Between now and June 23, you will not add features. You will only fix, complete, or polish items from the audit. If I propose a new feature mid-build, push back and tell me it's post-launch.

**2. No design changes.** Existing design tokens, `GlassCard`, typography, spacing, lime accent — untouched. The only design work is completing light mode across tabs that don't support it yet.

**3. File plan before code, every time.** Before any phase, list the files you'll modify and the files you'll create. Wait for my approval before writing code. This gate is non-negotiable.

**4. One phase at a time.** Do not work ahead. Complete a phase, show me, wait for approval, move on. If you finish a phase early, stop and report — don't start the next one unsolicited.

**5. Commit between items.** Every completed item from the audit gets its own commit with a message referencing the audit item number (e.g., `fix(0.1): implement delete account cascading deletion`). No bundled commits.

**6. Test before claiming done.** An item is not done until you've verified it works end-to-end on a real device or simulator. "The code compiles" is not done. "I ran the happy path and it worked" is done.

**7. Flag when you find something worse than expected.** If you discover an issue isn't what the audit described — scope is larger, dependencies are broken, a supposedly-working feature isn't — stop and tell me before proceeding. Do not expand scope silently.

**8. Track progress in the audit document.** As items are completed, add a status line to the audit file: `- [x] 0.1 Delete Account — completed 2026-04-21, commit abc123`. This is our source of truth for what's shipped.

---

## Week 1 (April 20–26) — Ship-breakers

Goal: eliminate the items that would cause App Store rejection, data corruption, or uncontrolled cost within hours of launch.

### Day 1 — Item 0.1: Delete Account

**Backend:**
Implement `DELETE /users/me` with full cascading deletion. Apple 5.1.1(v) and Google Play both require in-app account deletion. Cascade through every table referencing `user_id`: sessions, meals, wellness check-ins, weight logs, water logs, posts, stories, comments, likes, followers, following, DMs, moments, highlights, OAuth tokens, push tokens, refresh tokens, rate_limits, password_resets, any others. Wrap in a single transaction. Soft-delete recommended: set `deleted_at` and a scheduled job hard-deletes after 30 days. User sees immediate success; recovery possible within grace period. Return 204 on success.

**Mobile:**
Replace the "Coming Soon" alert in Settings → Delete Account with: confirmation screen explaining what will be deleted and the 30-day grace period; type-to-confirm field where user types their exact username; final red "Delete my account" button enabled only when username matches; on tap calls `DELETE /users/me`, clears SecureStore, shows success screen, returns to landing screen; handle 401 (session expired) by asking user to re-log in before deletion.

### Day 2 — Item 0.2: Rate limiting

Move all rate limits from in-memory dict to a persistent `rate_limits` table keyed by `(user_id OR ip_address, endpoint, window_start)`. Add specific limits:
- `/meal-plan/regenerate` — 1/hour per user
- `/food/scan` — 20/day per user
- `/nutrition/assistant` — 20/day per user
- `/auth/login` — 10/minute per IP
- `/auth/signup` — 5/minute per IP
- `/auth/check-username` — 30/minute per IP
- `/moments/generate-caption` — 3/moment, 50/day per user

Limits survive server restart and work across workers. Return 429 with `Retry-After` header on exceed. Mobile handles 429 gracefully — never crashes.

### Day 3 — Item 1.1: Height bug + data recovery

**Mobile:** Fix height input in both `signup.tsx` and legacy `onboarding.tsx`. Replace single "ft" input with two separate numeric inputs: feet (1 digit) and inches (2 digits). Conversion: `height_cm = (feet × 30.48) + (inches × 2.54)`. Validate: feet 3–8, inches 0–11.

**Backend:** Data recovery migration. Find users where `height_cm < 120`. Flag with `needs_height_reconfirm = true`. Mobile shows one-time modal on next login asking user to re-enter height. After re-entry, recompute TDEE and macro targets. Do not silently auto-correct.

### Day 4 — Items 0.4 + 2.9: SecureStore + API URL fallback

**Mobile:** Replace AsyncStorage with `expo-secure-store` for JWT in `authStore.ts` and `api.ts`. Implement refresh token pattern: 1-hour access token + 30-day refresh token. On 401, attempt one silent refresh; on refresh failure, log out.

**Backend:** Implement `/auth/refresh`. Rotate refresh tokens on use. Store refresh token hashes in `refresh_tokens` table.

**Mobile API config:** Remove `http://192.168.1.160:8000` fallback. If `EXPO_PUBLIC_API_URL` unset at startup, throw clear error. Add correct production URL to EAS build environment variables for all build profiles.

### Day 5 — Items 1.5 + 1.6: Alembic migrations

Set up Alembic. Convert `_USER_COLUMN_MIGRATIONS` to versioned Alembic migrations. Add missing columns (`is_private`, `checkin_streak`, `dm_privacy`, others) to User ORM model. Remove all raw-SQL-on-boot logic. Verify by dropping and recreating dev DB from migrations end to end. Document migration workflow in `backend/README.md`.

### End of Week 1 — Review gate

Show me: all 5 top-priority items checked off, screenshots/video demonstrating each fix works end-to-end, updated audit document, any new items discovered.

---

## Week 2 (April 27 – May 3) — Remaining ship-breakers + silent data loss

### Day 6 — Item 0.5: Secrets, CORS, logging
Replace `allow_origins=["*"]` with specific production domains. Move secrets to env vars. Encrypt Strava/Whoop/Oura tokens at rest with Fernet. Remove OpenAI prompt/response content from INFO logs.

### Day 7 — Item 0.6: Media base64 fallback
Remove base64 data URL fallback entirely. If S3/R2 not configured at startup, throw error and refuse to start.

### Day 8 — Item 0.7: Prompt injection protection
Sanitize free-text inputs into `_generate_replacement_meal`. Validate AI outputs server-side against strict schema. AI output never directly modifies DB rows.

### Day 9 — Item 1.2: Swallowed onboarding errors
Remove `.catch(() => {})` from `patchOnboarding` and similar. Surface errors with retry buttons. Onboarding cannot complete locally without backend confirmation.

### Day 10 — Items 1.3 + 1.4: Survey edit + timezone
Fix nutrition survey edit flow to hydrate from backend, not `DEFAULT_SURVEY`. Add `timezone` column to users (IANA format). All day-scoped queries use user timezone for "today" boundaries.

### End of Week 2 — Review gate
All Tier 0 complete. All Tier 1 through 1.6 complete.

---

## Week 3 (May 4 – May 10) — Core spec gaps: critical paths

### Days 11–12 — Item 2.1: Weight tracking standalone screen
Build full screen per spec: trend graph with raw dots and 7-day rolling average, time range selector (7D/1M/3M/6M/1Y/All), goal alignment card (14-log minimum), stats row, Log Weight bottom sheet, morning reminder, logging streak.

### Day 13 — Item 2.2: Wellness tab visible
Remove `href: null` from `_layout.tsx`. Verify existing content renders. Empty states for missing data.

### Day 14 — Item 2.3: Password reset
Backend: `POST /auth/forgot-password` (always returns 200) + `POST /auth/reset-password`. Mobile: email input → confirmation → deep-link → new password screen → auto-login.

### Day 15 — Items 2.4 + 2.5: Wearable OAuth fixes
Fix Whoop and Oura OAuth callbacks (state-based pattern like Strava). Ensure Whoop/Oura data flows into readiness calculation. Wire Apple Health connect CTA on Home.

### End of Week 3 — Review gate
Auth, onboarding, password reset, weight tracking, wearable connections, wellness tab all functional.

---

## Week 4 (May 11 – May 17) — Core spec gaps: social + backend

### Day 16 — Items 2.6 + 2.7: Posts filter + club auto-join
Fix `post_type` vs `insight_type` mismatch. Migrate data. Auto-join clubs based on sport tags on signup.

### Day 17 — Item 2.8: Privacy server-side
Server-side enforcement for private accounts, DM audience, block list, message requests for non-mutuals.

### Day 18 — Items 1.7 + 1.8 + 1.9 + 1.10 + 1.11
Remove duplicate diagnosis endpoint. Fix Home strain gauge date comparison. Verify training load recomputes on PATCH /rpe. Make /signup default `onboarding_complete=False`. Delete legacy `onboarding.tsx`.

### Day 19 — Items 2.13 + 2.14
Document OpenAI key requirement. Implement or remove `readiness_delta_7d`.

### Day 20 — Audit checkpoint
Re-audit Tier 2. Decide what's safe to defer to v1.1.

---

## Weeks 5–6 (May 18 – May 31) — Light mode + performance

### Week 5: Light mode sweep
Tab-by-tab. Replace every hardcoded hex with theme tokens. Move `theme as T` patterns to `createStyles(t)`.
- Day 21: Activity tab (193 hex values)
- Day 22: Wellness screen (111 hex)
- Day 23: Nutrition (64 hex + frozen palette)
- Day 24: Home (42 hex)
- Day 25: Community / Profile / Settings (frozen palette)

### Week 6: Performance + polish
- Day 26: Batch Home dashboard awaits with `asyncio.gather`
- Day 27: Pagination on `/activities/`. Fix N+1 in `_build_post`.
- Day 28: Indexes on social search.
- Day 29: Tier 3 small visible fixes (weekday labels, RPE rendering, sport breakdown donut, etc.)
- Day 30: Final audit checkpoint

---

## Week 7 (June 1 – 7) — TestFlight internal + bug bash

### Day 31: Apple Developer enrollment (if not done)
Individual enrollment, $99, 24–48h verification.

### Day 32: EAS build setup
`eas build:configure`. Audit `app.json` (bundle ID, icons, permissions, HealthKit entitlement, push capability). First production build. `eas submit --platform ios --latest`.

### Day 33: TestFlight internal
Add yourself + Armen + 3–5 trusted friends. Daily use on real hardware.

### Days 34–35: Bug bash
Triage discovered bugs. Fix Ship items. Re-build daily.

---

## Week 8 (June 8 – 14) — TestFlight external + App Store listing

### Day 36: Beta App Review submission
Write What to Test, Beta App Description, feedback email, marketing URL. Submit (24–48h review).

### Day 37: Beta App Review approved
Generate public TestFlight link. Share with 50–100 beta users.

### Days 38–40: Beta bug bash + App Store listing
Monitor feedback daily. Fix critical bugs same-day. Build App Store listing in parallel: 6.7" screenshots, app description, keywords, category, age rating, privacy policy, terms of service, App Privacy questionnaire.

---

## Week 9 (June 15 – 23) — Submit, review, launch

### Day 41: Final production build
Increment buildNumber. Build, submit, attach to App Store version 1.0. Complete metadata.

### Day 42: Submit for App Store Review
Apple typically 1–3 days.

### Days 43–45: Wait + prepare launch
Monitor Resolution Center. Prep launch announcements. Final fixes only if critical.

### Day 46: Approved
Manual release strategy. Pick launch hour (morning US East = afternoon Europe).

### Day 47 — June 23: Launch
Release. App live worldwide within ~2 hours. Announce to community. Monitor crashes, reviews, backend errors.

---

## Post-launch — Week 1 after launch

Monitor daily: crash rate, review sentiment, retention, OpenAI cost. Fix critical bugs → v1.0.1 within 3–5 days. Do not ship new features. First week post-launch is stability only. Begin v1.1 planning.

---

## Rules when you hit problems

- If a week's work takes longer: cut scope from current week, don't compress future weeks.
- If you discover a new critical bug: stop, add to audit, fix if Tier 0.
- If asked to add a feature: refuse, point at this plan.
- If a phase is unclear: ask before building.
- Every Friday end-of-day: status update with completed items, in-progress, deferred, blockers, honest assessment (on track/behind/ahead).

---

## Starting action

Read the consolidated audit at `audits/consolidated-priority-list-2026-04-20.md`. Confirm you've read it. Then begin Week 1, Day 1, Item 0.1 — Delete Account. Produce the file plan for 0.1 and wait for my approval before writing code.