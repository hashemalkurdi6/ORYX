# Social + Profile + Auth Fixes — 2026-04-26

Fixes applied against `audits/social-profile-auth-audit-2026-04-26.md`.

## 1. Duplicate onboarding flows — RESOLVED

- Deleted legacy `armen/mobile/app/onboarding.tsx` (the 10-step flow without DOB).
- Updated `armen/mobile/app/(auth)/login.tsx` so post-login redirect for users
  without `onboarding_complete` now routes to `/(auth)/signup` (canonical 12-step
  flow with DOB + fat-loss rate selector).
- Updated `armen/mobile/app/index.tsx` initial redirect for the same reason.

## 2. Password complexity — RESOLVED

Both client and backend now enforce: ≥ 8 chars, ≥ 1 letter, ≥ 1 digit.

- `armen/backend/app/schemas/user.py` — added `_validate_password_complexity`
  helper + `field_validator` on `UserCreate.password` so `/auth/signup` 422s
  on weak passwords.
- `armen/backend/app/routers/auth.py` — extended `/auth/reset-password` with
  the same three checks (was length-only).
- `armen/mobile/app/(auth)/signup.tsx` — `validateStep2` now checks letter and
  digit presence; placeholder copy updated.
- `armen/mobile/app/(auth)/forgot-password.tsx` — `handleReset` enforces same
  rules; placeholder copy updated.

## 3. Privacy + Notifications persistence — RESOLVED

Settings now survive reinstalls instead of being lost local React state.

- `armen/backend/app/models/user.py` — added columns: `show_activity_heatmap`,
  `show_personal_bests`, `notifications_enabled`, `notif_workouts`,
  `notif_moments`, `notif_messages`, `notif_social`, `notif_ai_insights`,
  `email_verified`, `email_verification_sent_at`.
- `armen/backend/app/main.py` — corresponding `ALTER TABLE … ADD COLUMN IF NOT
  EXISTS` migrations appended to `_USER_COLUMN_MIGRATIONS`.
- `armen/backend/app/routers/users.py` — new `GET /users/me/preferences` and
  `PATCH /users/me/preferences` endpoints, plus `PreferencesPatchIn` schema and
  `_serialize_preferences` helper. Single source of truth for both screens.
- `armen/mobile/services/api.ts` — `UserPreferences` type +
  `getMyPreferences` / `updateMyPreferences` clients.
- `armen/mobile/app/settings/privacy.tsx` — replaced local `useState` with
  hydrated prefs and optimistic PATCH on every toggle.
- `armen/mobile/app/settings/notifications.tsx` — same.

## 4. Email verification — RESOLVED

- `armen/backend/app/services/email_service.py` — added
  `send_email_verification` (reuses the existing brand template).
- `armen/backend/app/config.py` — added `EMAIL_VERIFY_URL_BASE`.
- `armen/backend/app/routers/auth.py`:
  - `_create_email_verify_token` — 24h JWT scoped `email_verify`.
  - `_send_email_verification_for` — generates + dispatches token, stamps
    `email_verification_sent_at`.
  - `signup` — fires verification email on account creation (best-effort).
  - `POST /auth/verify-email` — public endpoint that flips `email_verified`.
  - `POST /auth/resend-verification` — auth'd endpoint with rate limit;
    echoes `debug_verification_token` in non-prod.
- `armen/backend/app/schemas/user.py` — `email_verified` exposed on
  `UserOut` + `UserOutInternal` so clients can branch on it.
- `armen/mobile/services/api.ts` — `verifyEmail` + `resendVerificationEmail`
  clients; `User.email_verified` field.
- `armen/mobile/app/(auth)/verify-email.tsx` — new screen. Auto-verifies on
  deep-link `?token=` query param; otherwise lets the user paste a token or
  resend. Refreshes auth user after success.
- `armen/mobile/app/settings/index.tsx` — adds a "Verify Email" row in the
  ACCOUNT section that only renders while `user.email_verified === false`.
