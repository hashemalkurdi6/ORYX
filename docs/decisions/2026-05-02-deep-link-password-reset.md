# 2026-05-02 — Deep-link password reset (oryx:// scheme)

**Date:** 2026-05-02
**Status:** Decided

## Context

Audit item 2.3 (password reset) is ~85% shipped: backend `POST /auth/forgot-password` and `POST /auth/reset-password` work, mobile `(auth)/forgot-password.tsx` has a two-stage UI (email request → token + new password), Resend wired in. But the email body sends a web URL based on `PASSWORD_RESET_URL_BASE`, which defaults to `https://oryx.app/reset` (`config.py:38`).

Two problems with that as currently shipped:

1. **No web landing page exists** at `oryx.app/reset` — production backend isn't deployed yet, no static site, the URL points at nothing. User would tap → 404 or coming-soon page → can't reset.
2. **Domain is wrong anyway.** We migrated from `oryx.app` to `oryxfitapp.com` on 2026-05-02 (commit `7511c64`); even if we built a landing page we'd build it under the new domain, requiring backend deploy + DNS + a `/reset` route.

The W19 plan flagged this as the open decision for Day 14 (Thu May 7) and asked the question as "deep-link vs manual-paste." That framing was incomplete — the manual-paste path doesn't actually work without first deploying a web landing page that doesn't exist.

## Decision

Use a custom URL scheme deep-link for password reset emails instead of a web URL. Email body sends `oryx://reset-password?token=<jwt>`. Tapping the link on a device with the ORYX app installed opens the app directly to the reset-password screen with the token pre-populated. No web round-trip, no landing page dependency, no backend deployment dependency.

The mobile screen file is renamed from `(auth)/forgot-password.tsx` to `(auth)/reset-password.tsx` to match the URL path. See "Path detail" below for the rationale.

## Reasoning

- **It's the only flow that works this week.** Deferring the verify CTA to Phase 2 (separate decision, see `docs/coordination/2026-05-02-verify-email-deferred.md`) was acceptable because email verification is non-blocking. Password reset is different — App Store reviewers test forgot-password during review, and a broken reset flow is a rejection risk. We need a working flow before TestFlight external beta.
- **It's the right long-term pattern anyway.** Even after backend deploy, web-link → manual-token-paste is meaningfully worse UX than tap-and-the-app-handles-it. Shipping deep-link now means we don't redo this work in Week 5-6.
- **Implementation is small.** ~2 hours: backend env var change, ~10 lines in `reset-password.tsx` (`useLocalSearchParams` + a `useEffect` that pre-populates token + advances stage), file rename + 2 reference updates in mobile (`login.tsx:124`, `settings/index.tsx:521`). No new screens, no new endpoints, no schema changes.
- **The custom URL scheme `oryx://` is already registered** in `armen/mobile/app.json:5` and used elsewhere. Zero new platform config.

## Alternatives considered

- **Keep the web URL, build a landing page first** — rejected. Forces us to make the backend deployment platform decision (Railway / Render / Fly.io) under launch pressure, plus build a static landing page at `oryxfitapp.com/reset` that just round-trips the user back to the app. Pure scope expansion for no UX gain.
- **Defer the entire feature to Phase 2** (matching the verify CTA pattern) — rejected. Email verification is non-blocking; password reset is launch-blocking. Apple specifically tests forgot-password during App Review. Shipping with a broken reset flow risks build rejection.
- **Use Universal Links (`https://oryxfitapp.com/reset` with associated-domains AASA)** — better long-term but bigger scope: requires hosting an `apple-app-site-association` JSON file at `https://oryxfitapp.com/.well-known/`, deploying the file before the app ships, and configuring `associatedDomains` in `app.json`. Defer to post-launch when web presence is real. Custom URL scheme is the right tradeoff for now.

## Path detail (sub-decision — resolved)

The mobile screen originally lived at `armen/mobile/app/(auth)/forgot-password.tsx`. Two ways to reconcile with the chosen URL `oryx://reset-password?token=...`:

- **(a) Use `oryx://forgot-password?token=...`** — would have matched the existing expo-router path exactly. Zero new files. Smallest diff. UX nit: "forgot-password" in the URL preview reads as "the user doesn't know."
- **(b) Use `oryx://reset-password?token=...` and rename the screen file** — chosen. Route name reflects the action (resetting), not the trigger (having forgotten). Email preview reads cleaner.

**Decision: (b)**. The file `(auth)/forgot-password.tsx` is renamed to `(auth)/reset-password.tsx`. Two mobile references update to match: `login.tsx:124` (the "Forgot password?" link from login) and `settings/index.tsx:521` (the in-app "Change Password" path that reuses the reset flow). The backend endpoint `POST /auth/forgot-password` keeps its name — it correctly describes the action of "starting a reset because the user forgot." Only the mobile route name changes.

Reasoning: the route name should describe what the screen does (reset the password), not the user's mental state when navigating to it (having forgotten). Cost is small (one file rename + two reference updates); UX gain is small but real.

## Consequences

- **Requires mobile `Linking` plumbing.** expo-router auto-routes `oryx://reset-password?token=X` to `app/(auth)/reset-password.tsx` with `token` exposed via `useLocalSearchParams`. Both cold-start (app launches from the tap) and warm-start (app already open) work via expo-router's built-in handling — no manual `Linking.addEventListener` needed for the basic case. We add explicit handling only if we hit a corner case (e.g., the screen is already mounted and needs to refresh state).
- **`PASSWORD_RESET_URL_BASE` env var must be set in prod** to `oryx://reset-password`. Default in `config.py` will be updated to match. Prod env config (Railway / Render / wherever the backend ends up running) needs to be updated when backend deploys.
- **No web fallback for users who tap the link on a device without the app installed.** Acceptable for now (no production users yet); revisit at Universal Links upgrade post-launch.
- **The W19 password-reset email won't render the URL well in some email clients** that try to make non-`http(s)` URLs unclickable. Most major clients (Gmail, Apple Mail, Outlook) handle `oryx://` correctly. If a client doesn't, the user sees the URL as plain text — they can long-press to copy or tap manually. Acceptable degraded fallback.
- **Smoke test path:** send a real password reset email via the test script after explicit user authorization, tap the link from an email client on a device with the ORYX app installed, verify the app opens to the reset-password screen at the "reset" stage with the token pre-populated, complete the reset, verify the new password works.

## Related

- W19 plan entry: `docs/weekly/2026-W19-week-of-May-04.md` — Item 2.3 deep-link decision (this resolves it)
- Earlier ADR: `docs/decisions/2026-04-21-resend-for-password-reset.md` — Resend provider choice (the original 2.3 implementation)
- Coordination note for verify CTA: `docs/coordination/2026-05-02-verify-email-deferred.md` — same root cause (no production backend), different conclusion (verify is non-blocking, password reset is launch-blocking)
- Implementation: pulled forward from Day 14 (Thu May 7) and shipped on 2026-05-02 in the same session as this ADR

## Implementation summary

1. **Backend** — change `PASSWORD_RESET_URL_BASE` default in `armen/backend/app/config.py:38` from `"https://oryx.app/reset"` to `"oryx://reset-password"`. Update prod `.env` to match (already-active env var; just flip the value).
2. **File rename** — `git mv armen/mobile/app/(auth)/forgot-password.tsx armen/mobile/app/(auth)/reset-password.tsx`. Update two references that point at the old path: `armen/mobile/app/(auth)/login.tsx:124` (the "Forgot password?" link from login) and `armen/mobile/app/settings/index.tsx:521` (the in-app "Change Password" path that reuses the reset flow). Backend endpoint `POST /auth/forgot-password` keeps its name (correctly describes the action of "starting a reset because the user forgot").
3. **Mobile** — in the renamed `armen/mobile/app/(auth)/reset-password.tsx`:
   - Import `useLocalSearchParams` from `expo-router`, add `useEffect` to the React import
   - Read `token` route param on mount via `useLocalSearchParams<{ token?: string }>()`
   - In a `useEffect`, if `token` is a non-empty string, call `setToken(token)` and `setStage('reset')` so the user lands directly on the new-password input
4. **Smoke test** — run `armen/backend/scripts/test_password_reset.py` (already exists per audit) against a real address, ASKING THE USER FIRST per the external-send rule.
5. **Coordination** — once prod backend deploys (Week 5-6), set `PASSWORD_RESET_URL_BASE=oryx://reset-password` in production env config. No code change needed at that point.

Atomic commit message: `feat(auth): deep-link password reset via oryx:// scheme`
