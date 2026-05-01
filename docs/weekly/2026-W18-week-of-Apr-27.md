# Week 2 — Apr 27 – May 03, 2026

Status: Completed (closed Saturday May 2, 2026)
Week of master plan: Week 2 of 9
Days remaining to launch: 52 (June 23, 2026)

---

## This week's goal

Close out remaining Tier 0 ship-breakers and Tier 1 silent-data-loss items. By Friday EOD, Tier 0 should be fully closed and Tier 1 items 1.1 through 1.6 closed. This is the last week before we move from "fix what would get us rejected" into "build what spec promises but doesn't exist."

If we don't finish Tier 0 this week, we eat into Week 3's spec-gap budget. That cascades.

---

## Critical (must ship this week)

These are non-negotiable. If any slip, we are behind, full stop.

- [x] **Item 0.5 — Secrets, CORS, logging hygiene**
  Owner: backend
  Replace `allow_origins=["*"]` with explicit production domains. Move all secrets out of code into env vars. Encrypt Strava/Whoop/Oura tokens at rest with Fernet. Strip OpenAI prompt/response content from INFO logs (PII + cost-leak risk).
  Verification: I grep for `allow_origins`, hit `/health` from a non-allowed origin and confirm CORS rejection, decrypt a token round-trip in a test, scrape `INFO` logs during a diagnosis run for prompt fragments.
  Status: Closed in Week 1 closeout (commit 86878ed, 2026-04-21) — scoped CORS + AI assistant domain lockdown landed there.

- [x] **Item 0.6 — Remove media base64 fallback**
  Owner: backend
  If S3/R2 not configured at startup with a real bucket, refuse to start. No more silently falling back to base64 data URLs in DB rows — that path bloats Postgres, breaks CDN caching, and was already flagged in audit as a prod-only landmine.
  Verification: I unset the S3 envs, confirm the app refuses to boot with a clear error. Set them with garbage values, confirm a real bucket-write smoke test fails fast.
  Status: Closed in Week 1 closeout (commit 86878ed, 2026-04-21) — media base64 capped + blocked in prod.

- [x] **Item 0.7 — Prompt injection protection on meal replacement**
  Owner: backend
  Sanitize free-text inputs into `_generate_replacement_meal`. Validate AI outputs server-side against a strict pydantic schema before any DB write. AI output never directly modifies DB rows — always passes through validation.
  Verification: I send a crafted injection payload through the meal-replace endpoint and confirm sanitization + schema rejection. I read the service and confirm no AI-output → DB path bypasses validation.
  Status: Closed in Week 1 closeout (commit 86878ed, 2026-04-21) — prompt-injection defense + AI assistant domain lockdown landed.

- [x] **Item 1.2 — Surface swallowed onboarding errors**
  Owner: mobile
  Remove `.catch(() => {})` from `patchOnboarding` and any sibling silent-swallow patterns. Network failures during onboarding must show an error UI with a retry button. Onboarding cannot complete locally if backend hasn't confirmed.
  Verification: I kill the backend mid-onboarding on a simulator and confirm the user sees an error and cannot proceed past the failed step.
  Status: Closed (commit ab13c5e, 2026-05-01) — nutrition-survey now surfaces hydration errors via dangerSoft block with Retry; Continue/Submit gated until resolved.

- [~] **Items 1.3 + 1.4 — Survey edit hydration + timezone**
  Owner: backend (timezone column + tz-aware queries) and mobile (survey hydration)
  Nutrition survey edit flow must hydrate from backend, not from `DEFAULT_SURVEY` constants — currently the user's saved answers vanish on re-edit.
  Add `timezone` (IANA) column to users. Every "today" boundary in day-scoped queries (steps, meals, check-ins, water, weight) must use the user's timezone, not server UTC.
  Verification: I edit my survey, hit save, re-open, and confirm answers are mine, not the defaults. I set my timezone to Asia/Tokyo, log a meal at 11pm local, and confirm it lands on the correct local day in `/nutrition/today`.
  Status: 1.3 closed (commit ab13c5e, 2026-05-01) — survey hydrates from saved profile, dangerSoft retry block on hydrate failure, plus bonus `cuisines_enjoyed` → `cuisines_liked` rename closing a silent data-loss path. **1.4 timezone work still open — explicitly deferred in 86878ed; carries to Week 3.**

---

## Coordination expected this week

- **0.5 → 1.4 ordering:** secrets work touches `.env` and `config.py`, timezone work touches `User` model. If both land same-day, mobile's `EXPO_PUBLIC_API_URL` swap and the alembic migration from last week's 1.5/1.6 work could conflict on `User`. Backend agent should land 0.5 first (lower-risk model touch), then 1.3/1.4.
- **1.2 contract:** mobile needs to know the exact error shape the backend returns on `/onboarding/patch` failures so the retry UI can show useful text. Backend agent: confirm error body is `{detail: string}` and 4xx-vs-5xx distinction is clean before mobile wires error UI.
- **0.7 schema:** the pydantic schema validating AI-generated replacement meals should mirror what mobile renders. Backend agent: when 0.7 ships, post the exact schema in `docs/coordination/open.md` so mobile knows what fields are guaranteed.

---

## Explicitly NOT this week

If anyone (user included) asks for these, push back and point to this section.

- No new screens or features. Weight tracking screen is Week 3.
- No light-mode work. Light mode sweep is Weeks 5–6.
- No palette redesigns. Palette is frozen per the dusk-revert decision.
- No DM, Moments, or portfolio post work. Cut from launch.
- No password reset. Week 3.
- No wearable OAuth fixes (Whoop/Oura). Week 3.
- No Apple Health connect CTA wiring. Week 3.
- No deload/warmup tweaks. Not on the path.

---

## Verification I'm running this week

- Daily: smoke `/health`, hit `/auth/login` with wrong password 11x in a minute, confirm 429 with `Retry-After` (validates last week's 0.2 hasn't regressed).
- After 0.5: CORS preflight from a non-allowed origin → 4xx. Token round-trip through Fernet. Log scrape for prompt fragments.
- After 0.6: boot the backend with empty S3 envs, confirm hard fail.
- After 0.7: injection payload through meal-replace, confirm rejection.
- After 1.2: kill backend mid-onboarding on simulator, confirm error UI and retry path.
- After 1.3/1.4: survey re-edit round-trip; tz-aware "today" boundary check via DB.
- Friday EOD: full Tier 0 status pass through the consolidated audit. Anything still open as of Friday becomes a Week 3 carryover with a written reason.

---

## Risks I'm watching

- **Item 0.5 sprawl.** Secrets + CORS + logging is three things in a trenchcoat. If the backend agent finds Strava token encryption requires touching the OAuth callback path, that could extend into Day 7 and squeeze 0.6.
- **Timezone migration on existing data.** When 1.4 lands, existing users have no tz set. Backfill needs a default (probably America/New_York for the founder + UTC for everyone else, with a one-time prompt to confirm). Backend agent should flag if backfill plan isn't trivial.
- **Mobile/backend drift on 1.2 error contract.** If mobile wires the retry UI before backend confirms the error body shape, we'll have a coordination bug to verify next week.

---

## Last week's review

### What shipped (Week 1, Apr 20–26)

- **Item 0.1 — Delete Account** — verified end-to-end, cascading deletion confirmed across user-referencing tables, type-to-confirm UI in Settings. (Backend + mobile)
- **Item 0.2 — Persistent rate limiting** — moved from in-memory dict to `rate_limits` table; per-endpoint limits enforce across worker restarts; 429 + `Retry-After` returned. Verified by hitting `/auth/login` 11x in a minute.
- **Item 1.1 — Height bug + data recovery** — feet/inches inputs land in both signup and onboarding; backend flags `needs_height_reconfirm` for users with `height_cm < 120`; modal prompts on next login.
- **Item 0.4 + 2.9 — SecureStore + API URL fallback** — JWT moved to `expo-secure-store`; `/auth/refresh` rotates refresh tokens; 192.168.x.x fallback removed; EAS build profiles have explicit prod URL.
- **Item 1.5 + 1.6 — Alembic migrations** — `_USER_COLUMN_MIGRATIONS` raw SQL retired; alembic versioned migrations now own schema; `is_private`, `checkin_streak`, `dm_privacy` etc. added to ORM model in sync; dev DB drop+recreate from migrations verified clean. Migration workflow documented in `armen/backend/README.md`.

### What got cut or deferred

- Nothing cut from Week 1 scope. All five priority items shipped on schedule.

### Lessons

- Cascading deletion on 0.1 was bigger than the audit suggested — at least 14 user-referencing tables, not the ~10 the audit listed. Note added to audit; future "cascading X" tasks should be re-scoped against the live schema before estimation.
- Rate limit table design (0.2) had a subtle bug initially: `window_start` rounded to minute boundaries caused a brief race where two requests could both pass the count check. Fixed with `SELECT FOR UPDATE`. This is the kind of thing that only shows up under load — flagged for the test infra plan.
- The `bcrypt==4.0.1` pin caught us once during `expo-secure-store` migration when a transitive bump tried to lift it. CLAUDE.md note holds; reaffirming.

### Honest assessment going into Week 2

**On track.** Tier 0 is half-closed (0.1, 0.2, 0.4 done; 0.5, 0.6, 0.7 remaining). Tier 1 is one-third closed (1.1, 1.5, 1.6 done; 1.2, 1.3, 1.4, 1.7–1.11 remaining). Week 2 closes Tier 0 and most of Tier 1 if nothing slips. Week 3's spec-gap budget is intact.

The thing that could blow this is item 0.5 sprawl. If it eats Day 6 and Day 7, we're behind by Friday. I'm watching it.

---

## End-of-week review (filled in Saturday May 2, 2026 — Friday EOD slipped by one day)

### What shipped

- **Item 0.5 — Secrets, CORS, logging hygiene** — closed in Week 1 closeout (commit `86878ed`, 2026-04-21). Scoped CORS, AI assistant domain lockdown, prompt-injection defense, rate-limit infra (`RateLimitEvent` model + service), JWT in SecureStore. Verified.
- **Item 0.6 — Media base64 fallback** — closed in `86878ed`. Capped + blocked in prod via `ENV` gate. Verified.
- **Item 0.7 — Prompt injection protection on meal replacement** — closed in `86878ed`. AI-output schema validation + free-text sanitization in place.
- **Item 1.1 — Height ft bug** — closed in `ab13c5e` (2026-05-01). Two whole-number fields (feet + inches) replace the single decimal; inches clamp 0–11; cm path unchanged. (Note: also flagged closed in `86878ed`; the Week-2 commit was the mobile-side correction that made the fix actually behave correctly in signup.)
- **Item 1.2 — Swallowed onboarding errors** — closed in `ab13c5e`. `dangerSoft` retry block replaces the silent `.catch(() => {})`; Continue/Submit gated while hydrating or while an error is unresolved.
- **Item 1.3 — Survey edit hydration** — closed in `ab13c5e`. Edit flow can no longer PATCH empty `DEFAULT_SURVEY` over saved preferences. Bonus: `cuisines_enjoyed` → `cuisines_liked` rename closed a silent data-loss path (cuisines were never being persisted before).
- **Item 1.10 — `onboarding_complete` bypass** — closed in `ab13c5e`. `handleFinish` now PATCHes `/auth/me/onboarding` between `signupComplete` and `getMe`, so the `(tabs)` gate stops bouncing new users back into signup.
- **Glass + motion polish on signup S3, S6–S12 + nutrition-survey** — `98c4013` and `cae884a` (2026-05-02). Brings every signup step and the survey up to the 51c7aa6 / 57e6f28 motion language. Not in audit scope but bundled while the same files were open.
- **expo-haptics install** — `1c70504` (2026-05-02). The signup + survey `tap()` helpers were already wired but `expo-haptics` wasn't in `package.json`, so every haptic call was a no-op. Now active.
- **Audit progress log** — `adde8dc` (2026-05-02). Recorded the 2026-05-02 closeout in `docs/audit/consolidated-priority-list-2026-04-20.md`.

### What got cut or deferred

- **Item 1.4 — Timezone column + tz-aware day-scoped queries.** Explicitly deferred in `86878ed` commit message. Carries to Week 3. No coordination work done yet on the existing-user backfill default. Still flagged as a Risk for next week.
- **Friday EOD itself slipped to Saturday morning.** Final two commits (`98c4013`, `cae884a`, `1c70504`, `adde8dc`) landed in the early hours of 2026-05-02 local. The work is done; the calendar boundary moved by ~6 hours. Not a scope slip.

### Lessons

- **The Week 1 closeout was bigger than tracked.** `86878ed` actually closed 0.5/0.6/0.7 plus a large slice of Tier 1 and Tier 2 — items the W18 plan still listed as "must ship this week." This means W18 was looking at a partly-stale picture from the start. Going forward: audit-ops needs to reconcile the closeout commit message against the upcoming-week's plan before the new week begins, not at Friday EOD.
- **Bundling polish with audit fixes was net-positive this week.** The signup/survey glass + motion pass landed in the same window as 1.1/1.2/1.3/1.10 because the same files were open. This was efficient on a one-off basis, but it muddied the "what's audit-driven vs polish-driven" tracking. For Week 3, keep them separate unless there's an obvious co-location reason.
- **The `cuisines_enjoyed` → `cuisines_liked` rename caught a silent data-loss path that wasn't in the audit.** Cuisines were never being persisted before the rename. This is the kind of bug that only surfaces when an agent is reading both ends of the same field in the same session. Worth keeping the bounded "bonus fix" surface available rather than rigidly scoping every commit to a single audit item.

### Honest assessment going into Week 3

**On track.** Tier 0 is fully closed. Tier 1 is mostly closed — 1.1, 1.2, 1.3, 1.5, 1.6, 1.10 are done; 1.4 (timezone), 1.7, 1.9, 1.11 carry to Week 3 or Week 4 per the master plan. Tier 2 had a partial uplift in `86878ed` (2.6, 2.9, 2.10, 2.13, 2.14 movement) but the formal Tier 2 push starts Week 3.

The risk for Week 3 is the **password reset flow (2.3)** — commit `7c63390` (the forgot-password fallback nav) is already on main, suggesting some 2.3 implementation has started ahead of schedule without coordination. Audit-ops needs to reconcile what's actually built vs what's in the W19 plan before Day 14, otherwise we'll either re-do work or skip a verification step.

The other risk is **1.4 timezone backfill on existing data**. When it lands in Week 3, existing users have no `timezone` set. Backend agent needs a backfill plan (default to America/New_York for the founder + UTC for everyone else, with a one-time prompt) before the migration runs.

Week 3's spec-gap budget is intact. We are still on track for June 23, 2026.

### Next week's priorities

See `docs/weekly/2026-W19-week-of-May-04.md`. Headline: weight tracking screen (2.1), wellness tab visible (2.2), password reset (2.3, partly in motion), wearable OAuth fixes + Apple Health CTA (2.4 + 2.5), and the deferred 1.4 timezone item.
