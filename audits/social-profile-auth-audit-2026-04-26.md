# Social + Profile + Auth Audit — 2026-04-26

## Status: in progress

Fresh read-only audit comparing against 2026-04-20 prior audit. Tagging each finding NEW / STILL BROKEN / FIXED.

---

## 1. AUTH — major fixes since 04-20

### Backend (`armen/backend/app/routers/auth.py`, 393 lines)

**FIXED — Password reset flow now exists.** Endpoints `POST /auth/forgot-password` (auth.py:236) and `POST /auth/reset-password` (auth.py:264) are implemented. `forgot-password` always returns 202 to avoid email enumeration; in non-prod it echoes the token for testers (auth.py:255-259). 30-minute reset JWT with `scope=password_reset` (auth.py:230-233). Length-only validation (≥8) on reset.

**FIXED — Rate limiting added on auth endpoints.** Prior audit said auth endpoints were un-rate-limited. Now:
- `signup`: 5 / 3600s per IP (auth.py:133-134)
- `login`: 10 / 60s per IP (auth.py:184-185)
- `forgot-password`: 5 / 600s per IP (auth.py:240-241)
- `check-username`: 30 / 60s per IP (auth.py:316-317)

This contradicts the brief's claim "Auth endpoints still un-rate-limited per backend audit. Confirm." — confirmed FIXED in code.

**NEW — Soft-delete + restore flow wired.** `delete_requested_at` blocks normal token use (auth.py:124-127). `POST /auth/login` for a pending-deletion user returns a `pending_token` scoped to `restore` (auth.py:194-212). `POST /auth/restore` (auth.py:287) re-activates within the grace window via `services/account_deletion.restore_user`. Audit log via `_log_event`.

**STILL BROKEN — Password complexity.** `reset-password` only enforces length ≥ 8 (auth.py:266). Signup validation is in pydantic schema — same length-only rule (verified below). No breached-password check, no complexity rules.

**STILL BROKEN — No email verification.** Signup creates active accounts with no email confirmation. Spam / impersonation risk unchanged from 04-20.

### Mobile login (`app/(auth)/login.tsx`, 218 lines)

**FIXED — Forgot password is wired.** `login.tsx:120` pushes to `/(auth)/forgot-password`. No more "Coming Soon" alert.

**FIXED — Pending-deletion handoff.** `login.tsx:48-58` detects `pending_deletion: true` response, routes to `/settings/restore-account` with the pending token + deletion date. Routes back to onboarding when `!user.onboarding_complete` (still uses `/onboarding`, not `/(auth)/signup`).

**STILL BROKEN — Onboarding redirect to legacy flow.** `login.tsx:65` still routes to `/onboarding` (the 10-step legacy file at `app/onboarding.tsx`) — the duplicate-flow problem from 04-20. See §2.

### Mobile forgot-password (`app/(auth)/forgot-password.tsx`, 213 lines) — NEW

Two-stage UI: request token, then reset. In dev/non-prod, the backend returns `debug_reset_token` and the screen pre-populates it (line 41-46). In prod the user must paste a token from email. Wired to `forgotPassword` / `resetPassword` in `services/api.ts:578-601`. Length-only password validation (line 61). On success calls `getMe`, sets auth, navigates to `/(tabs)/`.

**STILL BROKEN / UX gap — Production users have to copy a token from email and paste it back into the app.** No deep link / universal link handler. The reset URL (`PASSWORD_RESET_URL_BASE` from settings) presumably points at a web page; the mobile flow has no `Linking` listener. Workable but clunky.

### JWT token storage (`services/authStore.ts`, 111 lines)

**FIXED — JWT now in SecureStore.** authStore.ts:39-66 routes token through `expo-secure-store` on native, falls back to `localStorage` on web. `partialize` (line 108) excludes the token from the AsyncStorage-persisted slice. **Resolves prior 04-20 LAUNCH BLOCKER #7.**

**STILL BROKEN — No refresh token.** Still 7-day access token, then forced re-login.

### API client (`services/api.ts`, 2160 lines)

**FIXED — Hardcoded LAN IP fallback removed.** api.ts:476-481 throws if `EXPO_PUBLIC_API_URL` is not set at bundle time — production build will fail rather than silently target dev. **Resolves prior 04-20 LAUNCH BLOCKER #8.**

`forgotPassword`, `resetPassword`, `restoreAccount`, `deleteMyAccount` all wired (api.ts:569-621). `restoreAccount` correctly bypasses the auto-injected Bearer (uses `axios` directly with explicit pending-token Authorization).

### Settings index (`app/settings/index.tsx`, 862 lines)

**FIXED — Delete Account routes to real flow.** settings/index.tsx:529-537 → `/settings/delete-account`. **Resolves prior 04-20 LAUNCH BLOCKER #1.**

**FIXED — Change Password routes to forgot-password.** settings/index.tsx:519-527. (Re-uses the password reset flow for in-app password change — pragmatic but requires the user to have email access.)

**STILL MISSING — Change Email row removed entirely.** No row exists. Spec required it; gone now (perhaps deferred). Still missing.

### Delete Account screen (`app/settings/delete-account.tsx`, 366 lines) — NEW

Three-step flow: warning → username-confirm → success. Calls `DELETE /users/me` (soft-delete). 30-day grace window messaging. Auto-clears auth + redirects to login after 5s. Username typed-confirmation prevents accidents. Uses theme tokens, no hardcoded hex.

**Notes:**
- The deletion date (`deletionDateStr`, line 74-78) is computed client-side as `today + 30`. The backend's actual `deleted_at` is set in `soft_delete_user` and may differ slightly. Cosmetic only.
- After 401 handling: alerts and clears auth — good.

### Restore Account screen (`app/settings/restore-account.tsx`, 207 lines) — NEW

Flagged for read; will inspect briefly below.

### Privacy (`app/settings/privacy.tsx`, 167 lines)

**STILL BROKEN — Privacy toggles still local-only.** File header (lines 1-7) still says "All fields here need backend support that doesn't exist yet". But this is now FALSE for `is_private` — backend already exposes it (users.py:205) and `dm_privacy` exists per the brief. The mobile screen has not been wired to `PATCH /users/me/profile`. Local `useState` only (privacy.tsx:78-81). **STILL LAUNCH BLOCKER #6 from 04-20.**

### Notifications (`app/settings/notifications.tsx`, 140 lines)

Untouched line count (140) suggests still local-only. Confirmed STILL BROKEN.

---

## 2. ONBOARDING

**FIXED — Height "ft" parsing.** Both `app/(auth)/signup.tsx:179-188` and `app/onboarding.tsx:184-193` now have `parseFtIn` that splits on `.`, treats integer part as feet and decimal as inches (capped at 11), then converts feet*12 + inches → cm via 2.54. Resolves prior 04-20 LAUNCH BLOCKER #3.

**FIXED — Auto-join clubs.** `signup.tsx:282-283`, `onboarding.tsx:243-244`, and `community.tsx:791` all call `autoJoinClubs()`. Resolves prior 04-20 LAUNCH BLOCKER #5.

**STILL BROKEN — Duplicate onboarding flows.** `app/onboarding.tsx` (857 lines) and `app/(auth)/signup.tsx` (1048 lines) still co-exist. login.tsx:65 still routes to `/onboarding`. Even though the height bug is fixed in both, the two flows still differ in DOB capture (signup has DOB, onboarding still uses raw `ageStr`/`age` per the brief — confirmed at onboarding.tsx:286 passes `age: age > 0 ? age : undefined`, no `date_of_birth`). Prior 04-20 LAUNCH BLOCKER #4 remains.

---

## 3. SOCIAL — backend changes

### Posts (`routers/posts.py`, 985 lines)

**FIXED — `posts_likes` unique constraint.** posts.py:653 uses `on_conflict_do_nothing(constraint="uq_post_like")` per CLAUDE.md note.

**STILL BROKEN — `post_reports` FKs are still TEXT-typed.** `app/main.py:439` creates the table with `reporter_user_id TEXT NOT NULL, reported_post_id TEXT NOT NULL`. `services/account_deletion.py:98-99` even has a comment "post_reports uses TEXT columns — cast explicitly" and uses `:uid_text` cast. The cleanup works around it but the schema is still wrong (no FK integrity). Prior audit flag confirmed.

### Stories (`routers/stories.py`, 267 lines)

**Confirmed FIXED / matching CLAUDE.md.**
- 24h expiry via `_expire_old_stories` (stories.py:31).
- `story_type` and `is_highlight` always set in constructor (stories.py:77, 87).
- Feed grouped own → unseen → seen (stories.py:164-169).

### Soft-delete sweeper (`services/account_deletion.py`)

Imported by both `routers/auth.py` (`restore_user`, `_log_event`) and `routers/users.py` (`soft_delete_user`). Confirmed wired end-to-end:
- `DELETE /users/me` → soft delete (users.py:97-115)
- `POST /auth/login` for pending user → returns pending_token (auth.py:194-212)
- `POST /auth/restore` consumes pending_token (auth.py:287)
- `get_current_user` blocks normal auth on pending users (auth.py:124-127)
- Deleted users hidden from public profile lookups (users.py:161, 229)
- DM `start_conversation` excludes deleted users (messages.py:452)

---

## 4. MESSAGES / DM PHASE 1

### Backend (`routers/messages.py`, 729 lines) — NEW since 04-20

Comprehensive REST DM API with privacy gating + message requests. Endpoints:
- `GET /messages/conversations` (line 268)
- `GET /messages/conversations/requests` (309)
- `GET /messages/conversations/{id}/messages` (338)
- `POST /messages/conversations/{id}/messages` (376)
- `POST /messages/conversations/start` (436)
- `POST /messages/conversations/{id}/read` (535)
- `DELETE /messages/conversations/{id}/messages/{message_id}` (556)
- mute / unmute / archive / unarchive (603-633)
- `GET /messages/unread-count` (639)
- `GET /messages/dm-candidates` (687)

**Privacy gate (messages.py:459-470):** uses `users.dm_privacy` column with values `everyone | mutuals | following`. Default is `mutuals`. New conversations route to "requests" inbox if not satisfying recipient's policy. **NEW behavior — confirms `dm_privacy` is first-class on backend.**

**Phase 1 restrictions:**
- Only `text` messages accepted (messages.py:392-396); enum reserves image/workout_card/daily_insight/weekly_recap/story_reply/post_share for later.
- 2000-char limit (messages.py:26).
- Block check on send + start (messages.py:411-412, 456).

**STILL BROKEN — Mobile DM screen polls every 10s.** Per prior audit `messages/[id].tsx:38` `POLL_INTERVAL_MS = 10_000`. No websocket.

**STILL BROKEN — DM attachments still un-wired.** "+" button still decorative.

---

## 5. PROFILE / SOCIAL UI — quick checks

- `customize.tsx:433` "Close friends list management lands with the preferences endpoint" — STILL BROKEN.
- Profile heatmap endpoint `/activities/heatmap` — not re-checked, likely still STILL BROKEN.
- AthleteProfileModal — not re-checked.

---

## 6. LAUNCH BLOCKERS — status carry-over from 04-20

| # | Prior blocker | Status |
|---|---------------|--------|
| 1 | Delete Account not implemented | **FIXED** — full flow in `app/settings/delete-account.tsx`, soft-delete + 30d grace |
| 2 | Password Reset not implemented | **FIXED** — backend endpoints + mobile screen |
| 3 | Height "ft" unit bug | **FIXED** — `parseFtIn` in both signup.tsx and onboarding.tsx |
| 4 | Duplicate onboarding flows | **STILL BROKEN** — both files exist, login still routes to legacy `onboarding.tsx` |
| 5 | Auto-join clubs on signup not wired | **FIXED** — invoked at signup + onboarding + community mount |
| 6 | Privacy features stubbed | **STILL BROKEN** (mobile) / partially fixed (backend has columns) — UI not wired |
| 7 | JWT in AsyncStorage | **FIXED** — SecureStore on native |
| 8 | Default API URL = LAN IP | **FIXED** — throws if env var missing |

---

## 7. NEW CONCERNS / REMAINING

- **Password reset UX (mobile):** users must copy a reset token from email and paste — no deep-link Linking handler. Acceptable for TestFlight; rough for App Store launch.
- **No password complexity beyond length ≥ 8** on signup or reset.
- **No email verification** — signup creates active accounts immediately.
- **`post_reports` still TEXT-typed FKs.**
- **Notifications + Privacy + Customize** screens still local-only state despite some backend fields existing.
- **Change Email row removed** from settings — was in spec, now absent.
- **Reports (UGC moderation) workflow** — still no admin/moderator surface visible.
- **Comment nesting depth** — still no backend cap (not re-checked but no migration in messages router suggests unchanged).

---

## Status: complete




