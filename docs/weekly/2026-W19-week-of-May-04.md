# Week 3 — May 04 – May 10, 2026

Status: Future
Week of master plan: Week 3 of 9
Days remaining to launch (as of Mon): 50 (June 23, 2026)

---

## This week's goal

Close core spec gaps on critical user paths: weight tracking standalone screen, wellness tab visible, password reset flow end-to-end, wearable OAuth fixes (Whoop + Oura), Apple Health connect CTA wired on Home.

By Friday EOD: auth, onboarding, password reset, weight tracking, wearable connections, and wellness tab all functional per spec.

---

## Critical (must ship this week)

- [ ] **Item 2.1 — Weight tracking standalone screen** (Days 11–12)
  Owner: mobile (primary) + backend (data shape if needed)
  Full screen per spec: trend graph with raw dots and 7-day rolling average, time range selector (7D/1M/3M/6M/1Y/All), goal alignment card (14-log minimum), stats row, Log Weight bottom sheet, morning reminder, logging streak.

- [ ] **Item 2.2 — Wellness tab visible** (Day 13)
  Owner: mobile
  Remove `href: null` from `_layout.tsx`. Verify existing content renders. Empty states for missing data.

- [ ] **Item 2.3 — Password reset flow** (Day 14)
  Owner: backend + mobile
  Backend: `POST /auth/forgot-password` (always returns 200) + `POST /auth/reset-password`.
  Mobile: email input → confirmation → deep-link → new password screen → auto-login.

  > Drift: commit `7c63390 fix(auth): fall back to /login when forgot-password has no nav history` landed on main before Week 3 started. Some 2.3 work is already in motion. Audit-ops should reconcile what's done vs what remains before Day 14 begins — this may compress to a half-day.

- [ ] **Items 2.4 + 2.5 — Wearable OAuth fixes + Apple Health CTA** (Day 15)
  Owner: backend (OAuth callback fixes) + mobile (Apple Health CTA on Home)
  Fix Whoop and Oura OAuth callbacks (state-based pattern like Strava). Ensure Whoop/Oura data flows into readiness calculation. Wire Apple Health connect CTA on Home.

---

## Coordination expected this week

- **2.3 password reset:** backend confirms email-send mechanism (transactional email provider) before mobile builds the email-input UI. Deep-link scheme must be agreed: `oryx://reset-password?token=...` proposed; needs explicit decision.
- **2.4/2.5 wearable callbacks:** state-based OAuth pattern from Strava (item already in repo) is the template. Backend agent should mirror it for Whoop and Oura, not invent a new pattern.
- **2.1 weight screen:** confirm backend `/weight` endpoints already return enough data for 7-day rolling average + 1Y range — if not, surface as backend coordination item before mobile starts the graph.

---

## Explicitly NOT this week

- No social/posts work (Week 4).
- No light-mode work (Weeks 5–6).
- No new features outside audit Tier 2.
- No DMs, Moments, portfolio posts.

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
