# Week 3 — May 04 – May 10, 2026

Status: Active
Week of master plan: Week 3 of 9
Days remaining to launch (as of Mon): 50 (June 23, 2026)

> **2026-05-02 reconciliation:** pre-week audits found `/weight` endpoints already cover 2.1 (no backend block) and 2.3 password reset is ~85% shipped via `c43f394` (Resend wired, both endpoints live, mobile UI built, auto-login works). Day 14 budget compresses from 1 day → ~2-3 hours; freed budget reallocated to **Item 1.4 timezone work** (deferred from W18). Plan below reflects the reconciled schedule.
>
> **2026-05-02 Saturday morning closeout:** 2.2 + 2.1 both shipped on Day 10 (the weekend before W19 officially starts). Audit reconciliation found `app/weight.tsx` was already substantially built (commit pre-dates 2026-04-20); only spec gap was the goal-alignment card using all-time `data_confidence` instead of 14-of-last-14. Both items closed:
> - `82772f5 feat(wellness): make tab visible (audit 2.2)` — removed `href: null`, added heart-icon tab between activity + profile
> - `dadd82d fix(2.1): goal alignment requires 14-of-last-14 days` — parallel `range=1m` fetch, `recent14Logged` memo, gate corrected, `total_logs` surfaced on streak card
> - `684d17f docs(audit): close 2.2 + 2.1 W19 mobile work` — audit doc rows updated
>
> Days 11–12 budget freed entirely. Reallocated below.

---

## This week's goal

Close core spec gaps on critical user paths: weight tracking standalone screen, wellness tab visible, password reset deep-link polish, wearable OAuth fixes (Whoop + Oura), Apple Health connect CTA wired on Home, and the deferred timezone column from W18.

By Friday EOD: auth, onboarding, password reset, weight tracking, wearable connections, wellness tab, and tz-aware day-scoped queries all functional per spec.

---

## Critical (must ship this week)

- [x] **Item 2.2 — Wellness tab visible** ✅ Sat May 2 (`82772f5`)
  Owner: mobile
  Removed `href: null` from `armen/mobile/app/(tabs)/_layout.tsx:179`. Added heart-icon tab entry placed between activity and profile. Wellness screen pre-existing empty state confirmed safe for users with no data.

- [x] **Item 2.1 — Weight tracking standalone screen** ✅ Sat May 2 (`dadd82d`)
  Owner: mobile (backend confirmed sufficient)
  `app/weight.tsx` was already substantially built (pre-2026-04-20); spec audit found one real gap and one missing stat. Fixed: goal-alignment card now gates on `recent14Logged >= 14` from a parallel `range=1m` history fetch (was using all-time `summary.data_confidence` — sparse loggers read as "on track" with no recent data); `total_logs` now surfaced on streak card. All other spec items (range selector, dual-line trend chart, log sheet, reminder, streak) verified PASS.

- [ ] **Item 2.3 — Password reset deep-link polish** (Day 14, ~2-3 hours)
  Owner: mobile + backend (config flip only)
  ~85% already shipped in `c43f394`. Remaining: (a) decide deep-link vs current manual-paste token UX (see open decision below), (b) if deep-link: add `Linking.addEventListener` in `armen/mobile/app/(auth)/forgot-password.tsx` and flip `PASSWORD_RESET_URL_BASE` to `oryx://reset-password`, (c) end-to-end smoke test, (d) ADR for deep-link decision.

- [ ] **Items 2.4 + 2.5 — Wearable OAuth fixes + Apple Health CTA** (Days 11–13 ← pulled forward from Day 13/15)
  Owner: backend (OAuth callback fixes) + mobile (Apple Health CTA on Home)
  Audit reconciliation: 2.4 OAuth callbacks already closed in `86878ed` (state-based pattern shipped). 2.5 Apple Health CTA already closed in `86878ed` (navigates to /settings when vitals missing). **Remaining open:** Whoop/Oura readiness component integration — wearable data isn't yet flowing into readiness score even when connected. Backend agent owns this. Days 11–12 (freed by Sat morning closeout) become the budget for this work.

- [ ] **Item 1.4 — Timezone column + tz-aware day-scoped queries** (Days 13–14, ~6 hours)
  Owner: backend (primary) + mobile (TZ send on login)
  Pulled in from W18 deferred list. Status per audit: column + interceptor + critical-site migration done in `86878ed` (2026-04-21); **full tz-aware query sweep still open**. Sweep `routers/checkin.py`, `routers/daily_steps.py`, `routers/nutrition.py`, `routers/wellness.py`, `routers/home.py` for any remaining `datetime.utcnow()` or hardcoded UTC day windows; replace with user-tz-aware bounds. Mobile to send IANA TZ (`Intl.DateTimeFormat().resolvedOptions().timeZone`) on login + on TZ-change.

- [ ] **NEW — Welcome email on signup** (Day 14 PM or Day 15, ~2 hours)
  Owner: backend
  Added 2026-05-02 after CEO review of standalone spec. Reuses existing Resend integration (`email_service.py`, `password_reset.html` pattern). Sends from `founder@oryxfit.com` immediately after successful signup as a FastAPI `BackgroundTasks` (non-blocking — signup latency unaffected). Personal founder-voice copy. Domain `oryxfit.com` must be verified in Resend before enabling — flag if DNS records not yet set up. Test script at `backend/scripts/test_welcome_email.py`. See full spec in CEO review session 2026-05-02.

---

## Open decisions

- **2.3 deep-link vs manual-paste:** backend currently sends `https://oryx.app/reset?token=` (web URL); user manually pastes token into mobile app. Working as-is. Deep-link (`oryx://reset-password?token=`) is the better UX (~2 hr work) but web link is App-Store-acceptable. **Decide by Wed May 6 morning** so Day 14 work is scoped. Recommendation: ship deep-link — UX gap is visible, and the implementation is small.

## Day-by-day (revised after Sat morning closeout)

| Day | Date | Work |
|---|---|---|
| ~~10~~ | ~~Sat May 2~~ | ✅ 2.2 + 2.1 shipped (this was a weekend bonus before W19 started) |
| 11 | Mon May 4 | 2.4 Whoop readiness integration starts (backend) |
| 12 | Tue May 5 | 2.4 Oura readiness integration (backend) |
| 13 | Wed May 6 | 1.4 tz-aware query sweep starts (backend); deep-link decision locked AM |
| 14 | Thu May 7 | 1.4 sweep continues; 2.3 deep-link impl + ADR (mobile + 1 backend config flip) |
| 15 | Fri May 8 | Buffer / smoke test / EOD review |

---

## Coordination expected this week

- **2.4/2.5 wearable callbacks:** state-based OAuth pattern from Strava (already in repo) is the template. Backend agent should mirror it for Whoop and Oura, not invent a new pattern.
- **1.4 timezone:** mobile must send IANA TZ string (e.g. `America/New_York`) on login + on TZ-change. Coordinate column shape with backend before mobile sends it.

---

## Explicitly NOT this week

- No social/posts work (Week 4).
- No light-mode work (Weeks 5–6).
- No new features outside audit Tier 1/2.
- No DMs, Moments, portfolio posts.
- No transactional email beyond password reset and welcome (added 2026-05-02 per CEO review). No verification email, no marketing list, no digest emails — those wait for post-launch.

---

## Last week's review

Filed by audit-ops on Saturday May 2, 2026 (Friday EOD slipped by ~6 hours into Saturday morning local). Full retro lives in `docs/weekly/2026-W18-week-of-Apr-27.md` — summary below.

**What shipped:** Tier 0 fully closed (0.5 secrets/CORS/logging hygiene, 0.6 media base64 fallback, 0.7 prompt-injection defense — all in Week 1 closeout commit `86878ed`, 2026-04-21). Tier 1 mostly closed: 1.1 height ft bug, 1.2 swallowed onboarding errors, 1.3 survey edit hydration, 1.10 `onboarding_complete` bypass — all in commit `ab13c5e` (2026-05-01). Bonus: `cuisines_enjoyed` → `cuisines_liked` rename closed a silent data-loss path. Glass + motion polish on signup S3/S6–S12 + nutrition-survey landed in `98c4013` and `cae884a`. expo-haptics installed in `1c70504`. Audit progress log updated in `adde8dc`.

**What slipped:** Item 1.4 (timezone column + tz-aware day-scoped queries) explicitly deferred in `86878ed` and carries into Week 3. No prep work done yet on the existing-user backfill plan.

**Key risk to track this week:** commit `7c63390 fix(auth): fall back to /login when forgot-password has no nav history` landed on main before Week 3 started, meaning some 2.3 password-reset work is already in motion without coordination. Audit-ops should reconcile what's actually built vs what's in the W19 plan before Day 14, otherwise the team either re-does work or skips a verification step. See the drift note on item 2.3 above.

**Honest assessment:** On track for June 23, 2026. Tier 0 fully closed; Tier 1 mostly closed; Tier 2 starts in earnest this week. Week 3's spec-gap budget is intact.

---

## End-of-week review

> To be completed Friday May 8, 2026 EOD.
