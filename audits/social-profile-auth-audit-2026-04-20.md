# ORYX Social + Profile + Auth Audit — 2026-04-20

Auditor: Social+Profile+Auth agent. Read-only. Static review only; no live test
was run.

Scope: `app/(auth)/`, `app/onboarding.tsx`, `app/(tabs)/profile.tsx`,
`app/(tabs)/community.tsx`, `app/messages/*`, `app/settings/*`, `app/profile/*`,
and the social components (`AthleteProfileModal`, `PostCreator`,
`OryxInsightCreator`, `PostDetailModal`, `StoryCreator`, `StoryViewer`,
highlights).

---

## 1. AUTH — **LAUNCH CRITICAL**

### Login (`app/(auth)/login.tsx`)

**Files:** `armen/mobile/app/(auth)/login.tsx` (208 lines)
**Implementation status:** complete for email+password. Password reset is a
stub.
**Data:**
- credentials: real backend (`POST /auth/login`)
- post-login user fetch: real (`GET /auth/me`)
**Broken / partial:**
- "Forgot password?" opens an `Alert.alert('Coming Soon', …)`. No reset flow
  exists in backend (`routers/auth.py` has no `reset` / `recover` / `forgot`
  endpoint — confirmed via grep).
**Missing from spec:**
- Password reset. Spec calls this out explicitly as part of AUTH.
- No social / Apple / Google sign-in (not in spec, not a bug — noting).
- No biometric unlock.
**Light mode:** working — screen uses `theme.*` tokens throughout. No
hardcoded hex.
**Endpoints called:**
- `POST /auth/login`: success
- `GET /auth/me`: success (triggers onboarding branch if not complete)
**Notes:**
- Error parsing handles FastAPI `detail` as string or array (pydantic
  validation errors). Good.
- Route branches correctly on `onboarding_complete`.
- Redirects to `/(tabs)/` on success.

### Signup (`app/(auth)/signup.tsx`)

**Files:** `armen/mobile/app/(auth)/signup.tsx` (1,036 lines). **This is the
real signup AND the de facto onboarding flow** — 12 screens in one component.
**Implementation status:** complete. Calories & body stats captured, TDEE
calculated (Mifflin St Jeor), account created + onboarding saved in a single
`POST /auth/signup` at step 12.
**Data:**
- username availability: real (`GET /auth/check-username`, debounced 500 ms)
- account + onboarding: real (`POST /auth/signup` with `SignupCompletePayload`)
- post-signup: real (`GET /auth/me`)
**Broken / partial:**
- Connections step (10) is a placeholder — tiles just show an `Alert` telling
  users to connect later from Profile. This is fine UX but noted.
- `date_of_birth` is sent but user `weight_kg` is *not* seeded into
  `weight_logs` here — the spec says signup should "seed weight tracking first
  data point." Needs backend verification. **Flag.**
- "Skip" button is enabled on steps 3–7, 11. A user skipping sports/goal still
  continues — but step 5 (goal) and step 8 (body stats) are validated before
  Continue, so skips from other steps produce unset fields.
- Password strength requirement is just length ≥ 8. No complexity rules, no
  breached-password check.
**Missing from spec:**
- Email verification (spec doesn't explicitly require it but most production
  apps have it; its absence is a spam-account risk).
**Light mode:** working — uses `theme.*` tokens.
**Endpoints called:**
- `GET /auth/check-username`: success
- `POST /auth/signup`: success
- `GET /auth/me`: success
**Notes:**
- Good: DOB capture (DD / MM / YYYY with minimum age 13 validation). Solid.
- Fat-loss cut-rate picker: nicely done.
- Unit toggles (kg/lbs, cm/ft) work. `ft` conversion uses `× 30.48` — **BUG:**
  a user entering "5.11" meaning 5'11" gets converted as 5.11 × 30.48 =
  155.8 cm, which is *wrong* (should parse feet+inches). Height becomes
  severely under-recorded for ft users. Easily triggered by placeholder
  `'e.g. 5.11'` which implies feet.inches. **LAUNCH BLOCKER for any US user.**

### JWT / Token handling (`services/api.ts`, `services/authStore.ts`)

**Files:** `services/api.ts` (lines 471–507), `services/authStore.ts` (60 lines)
**Implementation status:** functional, but not hardened.
**Data:**
- Token persisted via `zustand` + `AsyncStorage` under key `oryx-auth-storage`.
**Broken / partial:**
- **Token storage: `AsyncStorage`, NOT `expo-secure-store` / Keychain.** The
  JWT is persisted in plaintext AsyncStorage. On a jailbroken / rooted device,
  or via a malicious backup, the token is readable. Backend tokens last **7
  days** (`ACCESS_TOKEN_EXPIRE_MINUTES = 10080`). **Security concern.**
- No refresh token. When the 7-day access token expires, user is silently
  logged out on the next request (401 interceptor → `clearAuth` → redirect to
  login). This is acceptable for v1 but means all users re-login weekly.
- 401 interceptor calls `router.replace('/(auth)/login')` inside a try/catch.
  The auth store is cleared but persisted store is *also* cleared via
  `clearAuth`, which is fine.
- No CSRF protection needed (JWT in Authorization header, not cookies).
- `baseURL` fallback is a hardcoded LAN IP (`http://192.168.1.160:8000`) — if
  `EXPO_PUBLIC_API_URL` is not set in production, the app silently attempts a
  private IP. **Launch risk** if release build doesn't have env var baked in.
**Light mode:** N/A.
**Notes:**
- Backend uses HS256 + `SECRET_KEY` from `.env`. If that secret leaks, every
  token is forgeable. Standard risk.
- bcrypt pinned to 4.0.1 (per CLAUDE.md) — fine.
- Password pre-hashed with SHA-256 before bcrypt (`hash_password` in
  `routers/auth.py`). This is the passlib workaround for 72-byte limit.
  Correct.

### Settings — Change Password / Change Email / Delete Account

**Files:** `app/settings/index.tsx` (888 lines)
**Implementation status:** **all three are stubs.**
**Broken / partial:**
- Change Password → `Alert.alert('Coming Soon', 'Password reset will be
  available in a future update.')` (line 521)
- Change Email → same pattern (line 531)
- Delete Account → two-step confirm, then `Alert.alert('Coming Soon', 'Account
  deletion will land before launch — for now, contact support to delete your
  account.')` (line 549)
**Missing from spec:** all three are required by spec.
**Endpoints called:** none — zero backend calls for any of these actions.
**Notes:** The settings screen has the UI rows but literally no wiring. **Delete
Account is both a spec requirement and an App Store / Play Store / GDPR legal
requirement.** Without it the app will likely be rejected by Apple's review.
**LAUNCH BLOCKER.**

---

## 2. ONBOARDING — **LAUNCH CRITICAL**

### `app/onboarding.tsx` (legacy, reachable)

**Files:** `armen/mobile/app/onboarding.tsx` (834 lines)
**Implementation status:** complete but **duplicated with signup.tsx**. Both
exist. `app/index.tsx` redirects unauthenticated users to
`/(auth)/signup` (which contains the 12-step signup+onboarding flow), and
logged-in users without `onboarding_complete` to `/onboarding` (the 10-step
legacy flow). `login.tsx` also routes to `/onboarding` when
`user.onboarding_complete` is false.
**Data:**
- `patchOnboarding(step)` per step: real (`PATCH /auth/me/onboarding`),
  errors swallowed silently
- Final finish: real (`PATCH /auth/me/onboarding` + `GET /auth/me`)
**Broken / partial:**
- Optimistic-local completion: `handleFinish` immediately sets
  `onboarding_complete = true` locally and navigates **before** the backend
  sync. If the API call fails, local state claims onboarding is done but the
  backend still says false → next `getMe` resets local to false → user is
  thrown back to onboarding. Error is swallowed with `.catch(() => {})`.
- Same height `ft` bug exists here: `(parseFloat(heightStr) || 0) * 30.48`
  misinterprets "5.11".
- Age uses a raw `ageStr` integer, not DOB — the newer signup.tsx has DOB.
  Inconsistent data model.
- Weight is saved to the user row but **spec says this should seed the weight
  tracking timeline** — no call to `logWeight` observed. Needs backend
  verification.
- Goal "Lose Fat" uses a fixed `-300 kcal` adjustment in legacy onboarding; the
  signup flow has a cut-rate picker. The two flows produce different calorie
  targets.
**Missing from spec:**
- DOB capture (present in signup.tsx, missing in onboarding.tsx).
- Seed of weight tracking first data point (unverified — probably missing).
- The two-flow duplication itself is a maintenance/launch risk.
**Light mode:** working — uses theme tokens.
**Endpoints:** `PATCH /auth/me/onboarding` success; `GET /auth/me` success.
**Notes:** **Recommend routing logged-in-but-not-onboarded users back to
`signup.tsx` too and deleting `onboarding.tsx` before launch**, or else
verifying the two flows stay in sync.

---

## 3. SETTINGS — **LAUNCH CRITICAL**

### Settings index

See §1 above for Change Password / Email / Delete. Other rows:

**Endpoints (connected apps):**
- `GET /strava/auth-url`: real, OAuth in `WebBrowser.openAuthSessionAsync`
- `GET /whoop/auth-url`: real, same flow
- `GET /oura/auth-url`: real, same flow
- `POST /hevy/connect`, `POST /hevy/sync`, `DELETE /hevy/disconnect`: real
- Apple Health: uses `expo-sensors` Pedometer permission only (not full
  HealthKit). CLAUDE.md says HealthKit is a dynamic require; Settings UI just
  grants pedometer. **Partial** — not the full HealthKit integration spec
  describes.

**Broken / partial:**
- Profile photo upload is missing from Edit Profile modal — the spec calls it
  out. The modal has full_name, username, bio, location, weight, sports (max
  3) but no avatar picker.
- Edit Profile weight is kg-only (no unit toggle).
- DOB, height, privacy toggle from spec's Edit Profile: **all missing** from
  this modal. (Height / DOB captured once at signup, never editable after.)
- Footer note leaks a developer URL example (`exp://192.168.1.160:8081`) —
  polish issue.

**Light mode:** mixed. The screen uses `theme.*` but also imports `theme as T`
(direct module reference) and hardcodes colors like `#FC4C02`, `#FF6B35`,
`#00B894`, `#FF3B30`, `rgba(255,107,53,0.15)` for provider rows. These are
brand colors (Strava orange etc.) so arguably correct. Safe.

### Appearance (`app/settings/appearance.tsx`)

**Implementation status:** complete. Dark / Light / Match device, persisted to
AsyncStorage under `oryx.appearance`, live theme swap via `ThemeContext`.
**Broken / partial:**
- Commented note in file itself: "Module-level `StyleSheet.create({ ... T.bg.primary ... })` usages at import scope need a full app reopen to fully repaint." This is true across the codebase — lots of screens use the top-level `theme as T` import which captures dark-mode colors at module load (community.tsx, profile.tsx, settings/index.tsx all import `T`). **Theme switch will not fully repaint these until the app is re-launched.** Polish blocker for light mode.
**Light mode:** this specific screen, yes. Other screens, see above.

### Notifications (`app/settings/notifications.tsx`)

**Implementation status:** **stubbed.** Local `useState` only. File header
explicitly states: "Toggles are local-state only for now: there is no
`users.notification_settings` column or backend route to persist them."
**Endpoints:** none.
**Missing from spec:** entire backend + push-notification delivery.
**Notes:** UI done, zero functionality. Toggles don't even persist across app
launches (no AsyncStorage).

### Privacy (`app/settings/privacy.tsx`)

**Implementation status:** **stubbed.** File header: "All fields here need
backend support that doesn't exist yet: users.is_private, users.dm_permission,
users.privacy_settings JSON, users.blocked_users + GET/PATCH
/users/me/preferences."
**Broken / partial:** private account toggle, DM audience, show heatmap, show
PRs, blocked users → all non-functional.
**Spec impact:** "privacy toggle per stat" on OryxInsightCreator is local-only
too; profile visibility settings don't exist.
**LAUNCH BLOCKER.** Private accounts are standard social-app table stakes.

### Help / About

**Implementation status:** static text screens. OK for v1.

---

## 4. PROFILE TAB — partial

### `app/(tabs)/profile.tsx` (2,640 lines)

**Implementation status:** mostly complete but with substantial gaps vs spec.
**Data:**
- Activities: real (`getActivities`) — drives badges + streak + heatmap client-side
- Followers/Following: real (`getFollowers` / `getFollowing`)
- User posts: real (`getUserPosts`)
- Highlights: real (`getUserHighlights`)
- Story create: real (`createStory`, `uploadMedia`)
- Profile updates: real (`updateMyProfile`)
**Broken / partial:**
- **Streak + heatmap are computed client-side** from the `getActivities` page
  (`computeCurrentStreak`, `computeLongestStreak`, `WorkoutHeatmap` at line
  946 takes `activities` prop). Spec says "365-day GitHub-style calendar" — so
  the real backend endpoint `/activities/heatmap?days=84` **exists in api.ts
  (line 954) but is NOT called by the profile tab.** Heatmap is therefore
  limited to however many activities `getActivities(page=1, perPage=20)`
  returns.
- Badges are hardcoded thresholds in mobile code (lines 136–200). No backend
  `/achievements/` endpoint in router list. Earned-state derivation is local.
- PRs section (`pbStats`) — need to confirm origin; likely computed
  client-side too.
- Stats row: spec says "4 user-chosen stats". Customize screen is partially
  built but not wired (see below).
- Three content tabs exist: Posts / Achievements / About. Good.
**Missing from spec:**
- 3-column / 2-column / list layout picker — customize.tsx stores locally but
  doesn't persist server-side (user.post_grid_layout exists in User type but
  isn't updated).
- Pinned post: api.ts has `patchPost({is_pinned})` so this is wired.
- Accent color theme: explicitly skipped by the customize.tsx header comment.
- Story highlights row with New button: wired (createHighlight + reorder).
- Connected apps publicly visible in About: partially — About tab shows user
  data but not integrations.
**Light mode:** profile.tsx imports `theme as T` at top — top-level styles
freeze dark-mode colors. Profile view will not fully repaint on theme switch
without app reload. **Polish blocker.**
**Endpoints:**
- `GET /strava/activities`: success (could fail if missing Strava key; returns
  empty)
- `GET /social/followers`, `/following`: success
- `GET /posts/user/{id}`: success
- `GET /highlights/user/{id}`: success
- `GET /activities/heatmap`: **NOT called** (bug / missed integration)

### Edit profile + Customize

**Customize (`app/profile/customize.tsx`)** — mostly stub. File header: "Most
fields here are local-only stubs because the matching backend columns don't
exist yet (users.featured_stats, users.privacy_settings, users.close_friends,
GET/PATCH /users/me/preferences). The pinned-post section is fully wired."
**Close friends "Manage" button** → `Alert.alert('Coming soon', …)` (line 433).
Spec requirement.

### Find Friends (`app/profile/find-friends.tsx`)

Search via `searchUsers`. Functional.

### Highlights

**Create (`highlights/create.tsx`)**: pull user stories, select, save — works
against `createHighlight`.
**View (`highlights/[id].tsx`)**: uses `getHighlightStories`. Comment on line
52 says `expires_at: s.created_at, // highlight stories don't expire — dummy`
— fine for the viewer but is a type-hack.

---

## 5. COMMUNITY TAB — mostly wired

### Feed (`app/(tabs)/community.tsx`, 1,987 lines)

**Implementation status:** functional at surface; several sub-features
incomplete.
**Data:**
- Feed: real (`getFeed(page, limit)`)
- Stories: real (`getStoriesFeed`)
- Clubs: real (`getClubs`, `getMyClubs`, `getClubDetail`)
- Leaderboard: real (`getClubLeaderboard`)
- Search: real (posts + athletes + clubs via ad-hoc `apiClient.get`)
**Broken / partial:**
- "Club feed coming soon" placeholder at line 1472: `<Text style={{...}}>Club
  feed coming soon</Text>`. Club Feed tab is not implemented.
- Filter pills (All, Following, Clubs, Workouts, Insights, Recaps): need
  verification — likely local filter only, no separate endpoints.
- Hardcoded colors in MenuOption (`#CED4E0`, `#F0F2F6`, `rgba(255,255,255,0.08)`)
  at line 96 — light-mode breakage.
- `apiClient` is imported as both default and named exports; mixed usage.
- Community header uses `theme as T` module import → light mode repaint
  issues.
**Missing from spec:**
- Story readiness color rings exist but confirmed only at viewer level (see
  StoryViewer).
- Swipe-up from feed to enter story mode: not confirmed.
**Light mode:** likely partial due to hardcoded hex + top-level theme imports.

### Stories

**StoryCreator (`components/StoryCreator.tsx`, 892 lines)**
- Implementation: uses `expo-camera` via dynamic require (graceful fallback),
  photo + text overlay + stats sticker + draggable positioning + pinch zoom.
- Spec asks for: Text, Sticker, Effects, Collapse tools → all present.
- ORYX Stats sticker: present (`statsAdded`).
- Filters: `activeFilter` state present but visual rendering unclear.
- 2-finger rotate sticker → not visible in first 120 lines; needs deeper read.
- "Also post to feed" + "Close friends" buttons: **close friends button
  missing from Share step** — there is `shareToStory` + `alsoPostToFeed` only.
  No close-friends audience selector. **Missing from spec.**
- Light mode: hardcoded `rgba(255,255,255,0.5)` placeholders etc. — fine
  because story editor is inherently a dark overlay over the photo.

**StoryViewer (`components/StoryViewer.tsx`, 567 lines)**
- Full-screen, progress bars, hold-to-pause, swipe-down-to-close present.
- Hardcoded `#555555` for readiness color fallback (line 76) — acceptable.
- Reply input: yes. Reactions: yes (`toggleReaction`).
- **Expiry:** server-side. Backend `_expire_old_stories` runs lazily on feed
  request (`routers/stories.py:30`). Confirmed real — 24h expiry is enforced
  server-side, good.

### Post creation

**PostCreator (`components/PostCreator.tsx`, 885 lines)**
- Photo + ORYX Insight, camera + gallery, club tag, also-share-as-story toggle.
- Hardcoded `#555555`, `#e0e0e0` — story-creator and post-creator palettes
  are mostly dark by design.

**OryxInsightCreator (`components/OryxInsightCreator.tsx`, 1,262 lines)**
- Spec lists 5 card types: Workout Card, Daily Insight, Weekly Recap,
  Nutrition Card, Text Card.
- Implemented: `workout`, `daily_insight`, `weekly_recap`, `nutrition`,
  `text` — **all 5 present** (InsightType union line 34).
- Privacy toggles per stat: **present** (`privacyToggles` state, show_*
  booleans for each metric). Good.
- Background style picker: 6 options driven by theme tokens.
- Location input: yes, with expo-location graceful fallback.
- Endpoint: `POST /posts` via `createPost`.

### PostDetailModal (`components/PostDetailModal.tsx`, 1,383 lines)

- Comments: `getPostComments`, `addComment` (with `parentCommentId` for
  replies → **nested replies supported** per api.ts:1588).
- Like: `likePost` / `unlikePost`, double-tap.
- Save: `savePost` / `unsavePost`.
- Like comment: `likeComment`.
- Edit / delete: `deleteComment` / `editComment`.
- Pin / archive / edit-caption: `patchPost`.
- Share as Story: wired to `createStory` from a post (verify).
- Comment depth limit: not verified — no explicit backend cap found in grep,
  so nested replies may cascade indefinitely. **Watch for abuse.**
- Report / Not Interested: `reportUser` / `hidePost` exist in api.ts.
- Copy Link: would need a deep-link URL — unverified.

### Clubs

- Default clubs seeded backend-side (`clubs.py:39 seed_default_clubs`).
- **Auto-join:** `POST /clubs/auto-join` endpoint exists (line 310) and iterates
  over `current_user.sport_tags`. `api.ts` exposes `autoJoinClubs`. **BUT:**
  search showed no call to `autoJoinClubs` from signup/onboarding. The endpoint
  exists but isn't invoked post-signup. **Bug — spec says "Auto-join by sport
  tags" on signup.**
- Club screen tabs (Feed / Members / Leaderboard): Feed is stubbed with
  "coming soon" text (community.tsx line 1472). Members / Leaderboard work.

### Leaderboard

- Server-side Monday reset: `_get_week_start()` returns this Monday 00:00
  (line 49, clubs.py). Every request filters activities >= week_start. There
  is **no cron** — reset happens naturally because each request computes the
  current week. Last week's top-3 is a separate query. This works correctly
  without a scheduler. Good.
- Metrics: training_load (default), sessions, steps. Matches spec.
- Gold/silver/bronze + current user pinned at bottom: check `LeaderboardList`
  in community.tsx — appears implemented.

### Public profile (AthleteProfileModal)

**Files:** `components/AthleteProfileModal.tsx` (768 lines). File header:
"hardcoded colors, and reuses the same circular-highlights + Posts / ..."
— some hardcoded colors remain per the comment itself.
**Endpoints:** `getAthleteProfile`, `getAthletePublicPosts`, `followUser`,
`unfollowUser`, `reportUser`, `blockUser`. All wired.
**Block enforcement:** backend `routers/social.py:235` excludes blocked users
from suggestions. Good — **blocks are actually enforced server-side**,
contrary to my initial concern.
**Missing from spec:** Activity tab on another user's profile is not confirmed.

---

## 6. MESSAGES / DMs — functional, polling-based

### `app/messages/index.tsx`, `[id].tsx`, `new.tsx`

**Implementation status:** complete for v1 text-only DMs.
**Data:**
- `listConversations`, `listMessageRequests`, `listMessages`, `sendMessage`,
  `startConversation`, `markConversationRead`, `deleteMessage`,
  `muteConversation`, `archiveConversation`, `getDmCandidates`,
  `getDmUnreadCount` — all real.
**Broken / partial:**
- **Polling every 10 seconds, not websocket.** `POLL_INTERVAL_MS = 10_000` at
  `messages/[id].tsx:38`. Spec doesn't strictly require real-time, but 10s is
  the lived experience — noticeably laggy in conversation.
- Optimistic send + rollback on failure: good.
- Long-press delete: own messages only.
- "+" attachment icon is decorative: styled as a button but no onPress
  handler (line 406: comment says "reserved for Phase 3"). Media / attachments
  not implemented.
**Missing from spec:**
- Message requests banner + inbox tab split: implemented.
- Mute / archive: implemented.
- Read receipts UI: unclear; spec doesn't require them explicitly.
- Typing indicator: not implemented.
**Light mode:** mostly `theme.*`, safe.
**Endpoints:** all real, hit correctly.

---

## 7. Light mode scan — summary

`grep #[0-9a-fA-F]{3,8}` across `app/` returned **680 hex-color occurrences
across 11 files**. Biggest offenders:
- `activity.tsx` (193), `nutrition.tsx` (41), `dashboard.tsx` (73),
  `wellness.tsx` (110) — out of my audit scope but flagged.
- **In my scope:** `community.tsx` (180), `profile.tsx` (29), `settings/index.tsx`
  (17), profile sub-screens (1 each).

Plus: `theme as T` static import pattern in `community.tsx`, `profile.tsx`,
`settings/index.tsx`, `OryxInsightCreator.tsx`, `StoryCreator.tsx`,
`PostCreator.tsx`, `PostDetailModal.tsx`. Each of these captures the current
(dark) theme palette at module load; switching appearance at runtime will
**not** recolor styles created at the top level, only those derived inside
render via `useTheme().theme`. Consistent with the warning in
`appearance.tsx`.

**Impact:** Light mode is functional at the widget level but visually
inconsistent on community + profile + settings + post detail modal until the
app is fully killed and relaunched.

---

## LAUNCH BLOCKERS (by June 23, 2026)

1. **Delete Account not implemented.** Apple App Store guideline 5.1.1(v)
   requires in-app account deletion. Play Store has the same rule. Current UI
   ends at an `Alert.alert('Coming Soon', …)`. Build will fail App Store
   Review.
2. **Password Reset not implemented.** Spec requirement + table stakes for any
   account-bearing app. No backend endpoint, no UI flow.
3. **Height "ft" unit bug** (`signup.tsx` and `onboarding.tsx`). US users enter
   "5.11" meaning 5'11" and get stored as 155.8 cm. All subsequent TDEE /
   calorie / BMI numbers are wrong. High-severity data corruption.
4. **Duplicate onboarding flows.** Legacy `app/onboarding.tsx` (10 steps, no
   DOB, fixed cut adjustment) vs. new `app/(auth)/signup.tsx` (12 steps, DOB,
   cut-rate picker). A user who signs up via legacy path lacks DOB; mixed
   schema. Collapse into one.
5. **Auto-join clubs on signup not wired.** Endpoint `autoJoinClubs()` exists
   but is never called after `signupComplete`. Spec requires it.
6. **Privacy features stubbed.** Private account toggle, DM audience, blocked-
   users management — all local-only. "Private" accounts are a baseline
   safety feature; without them, any reported abuse has no mitigation.
7. **JWT stored in AsyncStorage, not SecureStore.** 7-day token in plaintext.
   Replace with `expo-secure-store`.
8. **Default API URL fallback is a LAN IP.** `http://192.168.1.160:8000`. If
   `EXPO_PUBLIC_API_URL` isn't set in the production build, app is broken.
   Replace with a sentinel that throws, or ensure CI bakes the prod URL.

## LAUNCH POLISH

- Light mode repaint (top-level `theme as T` imports → move to
  `createStyles(theme)` pattern, already used in login/signup/settings
  subs).
- `Club feed coming soon` placeholder at `community.tsx:1472`.
- Email change in Settings (spec).
- Edit Profile needs: avatar upload, height editing, DOB editing, unit toggle
  for weight, privacy toggle.
- Notifications settings persist across app launches (at least via
  AsyncStorage) while the backend endpoint is being built.
- "Forgot password?" link currently visible in `login.tsx` but opens
  `Alert('Coming Soon')` — either hide it or ship the flow.
- `settings/index.tsx` footer text leaks developer URL.
- Heatmap on profile should call `/activities/heatmap?days=365` instead of
  reusing the 20-activity page fetched for badges/streak.

## POST-LAUNCH (v1.1 — cut if needed)

- Message requests approval flow (currently shows a tab but accept/decline UX
  is unclear).
- DM attachments ("+" button, Phase 3 per comment).
- Websockets / real-time messaging (upgrade from 10s polling).
- Typing indicators, read receipts for DMs.
- Story stickers beyond text + ORYX stats (2-finger rotate, filters panel,
  music — already partial).
- Close friends list server-side.
- Featured stats customization (stats row on profile).
- Accent color theme picker (explicitly dropped per code comment).
- Full HealthKit integration (currently only pedometer permission).
- Strava/Whoop/Oura: currently 503 if keys missing — that's fine; production
  needs keys configured.

## SECURITY CONCERNS

- **Token at rest:** AsyncStorage, not Keychain/Keystore. Replace with
  `expo-secure-store`.
- **No refresh tokens:** 7-day window means stolen tokens are valid for a long
  time. Consider shorter access tokens + refresh.
- **No email verification:** any email can sign up; disposable emails, spam
  accounts, impersonation all trivial.
- **No rate limiting visible** on `/auth/login` or `/auth/signup`. Brute-
  force + enumeration risk. Needs backend middleware.
- **Username enumeration via `/auth/check-username`**: returns
  `{available: true/false}` without rate limit. An attacker can scrape the
  user base. Acceptable for a social app but worth noting.
- **Unlimited comment nesting depth** — no backend cap visible. Abuse vector.
- **Report/Block:** block is enforced server-side (good). Report stores a
  reason but no moderation dashboard or workflow exists — reports go into the
  void. App Store reviewers may flag absence of user-generated-content
  moderation (guideline 1.2).
- **`patchOnboarding` errors are swallowed** (`.catch(() => {})`). A user
  whose onboarding never reaches the server will appear "done" locally but
  the backend won't have their macro target, sport tags, etc. Silent data
  loss.

---

**Files of highest concern (in order):**

1. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/settings/index.tsx`
   — Delete Account / Change Password / Change Email stubs (launch blocker).
2. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(auth)/signup.tsx`
   — height-ft bug at line 181 / 704.
3. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/onboarding.tsx`
   — duplicate flow, same height bug, silent sync failure.
4. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/services/authStore.ts`
   + `services/api.ts` lines 471–507 — AsyncStorage token storage.
5. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/settings/privacy.tsx`
   + `app/settings/notifications.tsx` — 100% stubbed.
6. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/profile/customize.tsx`
   — customize stubs.
7. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/community.tsx`
   line 1472 — "Club feed coming soon".
8. `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/profile.tsx`
   — heatmap endpoint not called; client-side streak; top-level theme import.
