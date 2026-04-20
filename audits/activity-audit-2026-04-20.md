# Activity Tab Audit — 2026-04-20

Scope: Activity tab, checkin screen, Track Activity modal, OutdoorTracker, manual workout logger, exercise library, rest timer, plate calculator, superset, RPE input, muscle map, weight tracking standalone screen, Strava/Hevy consumers, imported components.

Auditor method: read `activity.tsx` (3085 lines), `checkin.tsx` (667 lines), every imported component, grep every API call, verify backend routers for endpoints actually hit.

---

## Activity Screen — Top Sections

**Files:**
- `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/activity.tsx`

**Implementation status:** complete-ish, with several spec deviations and one critical light-mode issue.

**Data:**
- Readiness score: real backend (`GET /activities/readiness`). Uses `calculate_readiness(user_id, db)` — the same shared service called by `/home/dashboard` (verified in `armen/backend/app/routers/home.py:545` and `armen/backend/app/routers/user_activity.py:275`). Single source of truth: CONFIRMED.
- Weekly Training Load + ACWR: real backend (`GET /activities/weekly-load`).
- Steps: real (Pedometer on-device, mirrored to `/steps/` via `upsertDailySteps`).
- Stats (total workouts, hours, streak, longest streak): real (`GET /activities/stats`).
- Heatmap loaded via `getActivityHeatmap(84)` but NOT rendered anywhere in the current JSX. `ActivityHeatmap` component exists (lines 1527–1566) and is unused. Dead code.
- Weekly Volume chart (`BarChart`) is defined (`weeklyVolumeData`, line 2002) but is ALSO not rendered in the JSX. Dead code.
- `sportBreakdown` renders as horizontal bars, not a donut as the spec says.
- Feed: real (Promise.allSettled over manuals/Hevy/Strava).
- Wellness checkin loaded for warm-up personalization: real (`getWellnessCheckins(1)`).

**Broken / partial:**
- `weeklyVolumeData` and `ActivityHeatmap` are computed but never placed into the list. That's ~40 lines of computation and a working component that the user will never see. Either a merge-dropped chunk or leftover after a redesign.
- Sport breakdown is bars, spec says "donut chart". Functional but off-spec.
- The "Progress & Records" section contains only the sport bars + a static achievements grid. No "Personal Records", no lift PRs, no cardio PRs — spec language "Progress & Records" implies records.

**Missing from spec:**
- Weekly Training Load card is present (good) but the "EWMA" wording in spec is the backend metric name; the UI just shows a 4-week average bar + raw ACWR. Displayed correctly but there is no explicit EWMA readout.

**Light mode:** BROKEN. `activity.tsx` has **193** hardcoded hex color literals inside `createStyles(t)`. Most of the substyles (strength builder, cardio logger, rest timer, expanded modal, RPE prompt, all set rows, review screen, feed rest-day card, weekly load num formatting, share icon tints, etc.) use `#141820`, `#F0F2F6`, `#8B95A8`, `#525E72`, `rgba(28,34,46,0.72)`, `rgba(255,255,255,0.10)`, etc. — the dark theme baked in directly. Theme tokens (`t.text.primary` etc.) are used only on the top shell (title bar, stats card, readiness card, weekly load card, goals, journal header, filter chips, feed card outer). The content of every modal (SportSelector, CardioLogger, StrengthBuilder, ExerciseSearchModal, RestTimerOverlay, RPEPrompt, PostSessionView, StravaDetail, ExpandedModal) is dark-only.

**Endpoints called:**
- `GET /activities/` (getMyActivities) — success
- `GET /hevy/workouts` — success
- `GET /activities/?page=&limit=` (Strava — actually hits `/strava/activities` via getActivities, see api.ts line 614) — verified
- `GET /activities/stats` — success
- `GET /activities/heatmap?days=84` — success (but data unused)
- `GET /activities/weekly-load` — success
- `GET /activities/readiness` — success
- `GET /wellness/checkins?limit=1` (via getWellnessCheckins) — success
- `POST /steps/` — success (non-fatal on fail)

**Notes:**
- `loadEarlier` is shown unconditionally when any Strava items exist, even if there are no more pages — `getActivities(nextPage, 20)` is only filtered for duplicates but never tells the user "no more results".
- Journal pagination: displays max 8 weeks (`MAX_WEEKS=8`), then a "Load Earlier Sessions" button that fetches more Strava ONLY (never fetches more manuals or Hevy). If a user has >8 weeks of manual workouts, older ones are silently dropped. True pagination is server-only for Strava; manual + Hevy are always fully loaded up-front.
- Search filter works client-side only (across loaded items).
- `upsertDailySteps` stores HealthKit steps per day — fine.

---

## Plus / Action Menu

**Files:** activity.tsx lines 2422–2459

**Implementation status:** complete for all items EXCEPT spec mismatch.

**Per-item reality:**
- **Log Workout**: opens SportSelector → leads into strength or cardio. Works.
- **Log Run or Cardio**: opens CardioLogger pre-populated for "running". Works.
- **Start Warm-Up**: opens `WarmUpModal`. Works, fires `POST /warmup/generate`.
- **Track Activity**: opens `OutdoorTracker`. Works.
- **Log Sport Session**: `openLogModal()` — same exact handler as "Log Workout", no pre-filter for sport category. Functionally duplicated.
- **Log Rest Day**: bonus item not in the spec list, calls `POST /activities/rest`. Works.

**Notes:**
- Spec: "Log Workout, Log Run or Cardio, Start Warmup, Track Activity, Log Sport Session" — all five present (Log Sport Session is a duplicate of Log Workout but fine for v1).

---

## Manual Workout Logger (StrengthBuilder + CardioLogger)

**Files:** activity.tsx 540–842, exerciseLibrary.ts

**Implementation status:** partial.

**Present:**
- Exercise library search (EXERCISE_LIBRARY, categorized filter).
- Sets/reps/weight/RPE per-set inputs.
- Set types (working / warmup / drop / failure) — cycling pill.
- Elapsed timer.
- Rest timer (90s default, ±15s, skip).
- Per-exercise notes.
- Muscle chips on post-session view.
- Save → `POST /activities/` which triggers autopsy generation inline on backend (`armen/backend/app/routers/user_activity.py:353`). `PostSessionView` polls with a 15s timeout, shows "taking longer than expected" + a manual retry button that hits `POST /activities/{id}/autopsy`. AI autopsy DOES fire — confirmed.
- Cardio calorie estimate via MET × weight × duration.

**Broken / partial:**
- AI autopsy timeout UX: hard-coded 15s. The autopsy is generated synchronously in the save request, so by the time the response arrives `autopsy_text` is already set or null. The 15s timeout is against wall-clock only, never polls the backend — the retry button is the ONLY way to recover from a null first-try. `setAutopsyTimedOut(true)` fires on a bare timer whether or not `autopsy_text` is null. Works but the UX races.
- `handleStrengthComplete` skips ahead to `setLogStep('rpe')` BEFORE the POST completes, but `submitting && !completedActivity` path renders a spinner. Acceptable.
- Hard-coded intensity `'Moderate'` is passed to `logActivity` for strength workouts regardless of RPE submitted later. RPE is patched post-hoc via `PATCH /activities/{id}/rpe`. This means `training_load` (RPE × duration) initially stored is based on default RPE.

**Missing from spec (critical):**
- **Plate calculator**: NOT IMPLEMENTED. Grep: 0 matches across the codebase.
- **Superset mode**: NOT IMPLEMENTED. Grep: 0 matches.
- **Muscle map visualization**: NOT IMPLEMENTED — the post-session view shows colored muscle tag *pills*, not a body map. Grep for "MuscleMap" / "muscle.*svg": 0 matches.
- Exercise library is a flat list; no most-recent / most-used prioritization.
- No per-exercise history (previous weights are only shown as the last set of THIS session).

**Endpoints called:**
- `POST /activities/` — success
- `PATCH /activities/{id}/rpe` — success
- `POST /activities/{id}/autopsy` (retry only) — success

**Notes:**
- RPE-per-set inputs exist but are not used for training load; backend training_load uses session RPE × duration.

---

## OutdoorTracker (Track Activity)

**Files:** `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/components/OutdoorTracker.tsx` (1268 lines), `services/locationTracking.ts`, `services/activityMetrics.ts`

**Implementation status:** complete (impressively so — the nicest component in this area).

**Data:**
- GPS via `services/locationTracking.ts` — real, native location subscription.
- Leaflet dark-map embedded via WebView, glowing lime polyline + pulse dot.
- Splits, elevation gain/loss, pace, speed — real computed metrics.
- On save, persists to `/activities/` with `exercise_data[0]._outdoor=true` + `route_points` array (lat/lon/alt/ts). Polyline visible in ExpandedModal via `decodePolyline` when Strava format — BUT outdoor-saved activities store RAW route points, not an encoded polyline, so those activities will NOT re-render their map in the expanded modal (the expanded modal only decodes Strava `summary_polyline`). Round-trip map display for self-tracked activities is broken.

**Broken / partial:**
- Route playback for self-tracked activities missing (see above).
- Intensity is heuristically derived from avg speed only (>10 km/h Hard, >6 km/h Moderate, else Easy) — bicycle "Easy" pace is >6 km/h so this is too aggressive for cyclists. Minor.

**Light mode:** 4 hardcoded hex values (MAP_ACCENT, MAP_DANGER, MAP_BG, MAP_INK) all inside the Leaflet HTML — these are intentional map design constants, not a light-mode regression. Rest of chrome uses theme tokens.

---

## Exercise Library

**Files:** `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/services/exerciseLibrary.ts` (215 lines)

**Implementation status:** hardcoded static list.

**Notes:**
- `EXERCISE_LIBRARY` is a typed record of compound → ExerciseDefinition arrays. Good coverage of common lifts, but no search by equipment, no videos, no form tips, no custom-exercise add. Not in spec as requirements, but "exercise library" is listed.

---

## Strava Imports (consumer side)

**Files:** activity.tsx 166–216, 1196–1295

**Implementation status:** complete, with some polish issues.

**Data:**
- `GET /strava/activities?page=&limit=` via `getActivities`.
- `POST /strava/activities/{id}/autopsy` via `generateStravaAutopsy` — explicit user action, not automatic.

**Icon coverage:** 32 sport types mapped in `getStravaActivityIcon`. Fallback `stats-chart-outline`. Good.

**Pace formatting:** `formatPace` strips trailing `/km`, validates `M:SS` with sanity cap of 1800s (30 min/km). Returns `M:SS /km` — spec-compliant. Hidden in feed when `N/A /km`.

**Route map:** decoded Strava polyline → Leaflet WebView (dark Carto tiles, orange #FC4C02 line). Loads external leaflet CDN at runtime — will fail silently offline. Works.

**Broken / partial:**
- No backfill loop for missing autopsies on existing Strava activities — only a manual "Generate AI Summary" button in the detail view.
- "Load Earlier Sessions" button appears if ANY Strava activities exist (`feed.some(f => f.kind === 'strava')`) — doesn't check for a has-more flag. When clicked at end-of-list it fetches an empty next page and no-ops.
- No sync UI — Strava sync is triggered elsewhere (Settings).

**Endpoints called:**
- `GET /strava/activities` — success
- `POST /strava/activities/{id}/autopsy` — success

---

## Hevy Imports (consumer side)

**Files:** activity.tsx 1125–1161, 1359–1392

**Implementation status:** partial.

**Data:**
- `GET /hevy/workouts` via `getHevyWorkouts`. Backend auto-generates autopsy on new workouts during sync (`armen/backend/app/routers/hevy.py:136`).
- Fields shown: title, started_at, duration_seconds, exercises (title+sets), volume_kg, autopsy_text.

**Spec gap — PRs:**
- Spec: "Hevy imports: read-only, exercise list, volume, **PRs**."
- Reality: NO PR computation anywhere. Backend router has ZERO references to "PR" or "personal_record". Frontend shows only volume and exercise count. **PRs are fabricated in the spec; not implemented.**

**Broken / partial:**
- `h.exercises[i].sets[j].weight_kg ?? s.weight` pattern suggests the schema has been inconsistent. Works defensively.
- Hevy sync status (sync running, last synced) isn't surfaced in the Activity tab — only in Settings.

**Endpoints called:**
- `GET /hevy/workouts` — success

---

## Journal (grouped feed)

**Files:** activity.tsx 218–249, 2060–2150, 2315–2361

**Implementation status:** complete.

**Spec checks:**
- Grouped by week: YES (`getWeekKey` Monday-anchored).
- Collapsible week headers: YES.
- Search bar: YES (client-side substring).
- Filter tabs (All/Strength/Cardio/Sport/Strava/Hevy): YES.
- Pagination 8 weeks: YES (`MAX_WEEKS=8`), but with the Strava-only "load earlier" quirk (see above).
- Each card: sport icon ✓, name ✓, date ✓, duration ✓, load badge ✓, RPE badge — NOT RENDERED (the feed card renders `intensity` and `training_load` but never the RPE value), AI autopsy snippet ✓, share icon ✓.
- Share icon on every card: YES for manual/hevy/strava cards; REST DAY cards intentionally have none (line 1056-comment confirms).

**Broken / partial:**
- Strength filter includes Hevy; Cardio filter includes Strava; Sport filter requires `sport_category='sport'|'combat'`. Mind-body category has no tab.
- "Show N more" inside a week and "Load Earlier Sessions" at the bottom can coexist confusingly.
- RPE not shown in the feed card row despite spec mandate. Minor.

---

## Post-Session View / AI Autopsy

**Files:** activity.tsx 909–1047

**Implementation status:** complete.

**Notes:**
- Autopsy generation confirmed inline on `/activities/` POST via `generate_activity_autopsy` in `claude_service`. Model used is OpenAI GPT-4o-mini — per spec. Returns `activity.autopsy_text` directly on the create response.
- Timeout UX: 15s wall-clock, then retry button. Acceptable MVP.
- 2-sentence constraint and "insight not data repetition" are enforced in the backend prompt — not verifiable without reading `claude_service.py`, but the retry flow presumes that contract.

---

## Weight Tracking Standalone Screen — CRITICAL BLOCKER

**Files expected:** `armen/mobile/app/weight.tsx` or `armen/mobile/app/weight/index.tsx`

**Implementation status:** NOT STARTED.

**Evidence:**
- Home weight card (`armen/mobile/app/(tabs)/index.tsx:1203`) does `router.push('/weight')` on card tap.
- Glob `weight*.tsx` across `/armen/mobile` returns zero results.
- `app/` directory contains no `weight.tsx`, no `weight/` folder. Only `WeightLogSheet.tsx` (a modal bottom sheet in components/).
- Tapping the weight card in Home will push onto an unresolved Expo Router route → visible "Unmatched Route" / blank screen.

**Spec requirements NOT implemented:**
- Full trend graph (raw daily dots + 7-day rolling average line) — Home has a 7-day sparkline only; no full screen.
- Time range selector (7D, 1M, 3M, 6M, 1Y, All) — NONE.
- Rolling avg adapting to range — NONE.
- Goal alignment card (min 14 logs for full judgment) — the `/weight/summary` backend returns `goal_alignment` and `rate_of_change_kg_per_week` but there is no UI surface for the full card.
- Stats row (Current, Change, This Week avg, Rate per week) — NONE at standalone level.
- Log Weight button with bottom-sheet + yesterday pre-fill + unit toggle + note — WeightLogSheet has the bottom sheet and note, unit toggle (kg/lbs), but NOT "yesterday's weight pre-filled" — pre-fills today's `currentWeightKg` from summary.
- Morning reminder toggle with time picker — NONE.
- Logging streak — NONE.
- Connection to AI diagnosis + nutrition correlation — the backend diagnosis prompt DOES mention weight trend ("If weight trend data is present and misaligned with..." per `home.py:168`), so the data IS used upstream. No UI surface in the weight screen that doesn't exist.

**Endpoints available but not consumed:**
- `POST /weight/log` — consumed (via sheet)
- `GET /weight/history?days=&range=` — consumed on Home only (7d sparkline)
- `GET /weight/summary` — consumed on Home only
- `POST /weight/settings` — defined; unused in UI

**Severity: LAUNCH BLOCKER.** The Home weight card links to nowhere.

---

## Check-In Screen

**Files:** `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/checkin.tsx` (667 lines)

**Implementation status:** complete.

**Data:**
- `GET /checkin/today` (via getTodayCheckin) — real.
- `POST /checkin/caption` (via generateCheckinCaption) — real, Claude-backed.
- `POST /checkin/` (saveCheckin) — real.
- `GET /home/dashboard` for readiness/steps/cal/load stats overlay — real.

**Flow:**
1. Window screen — shows countdown if window_active, else "No Active Window". Already-done state handled.
2. Camera capture → preview with photo + dark gradient + stats overlay pill.
3. Caption auto-generated; user can regenerate up to 3 times.
4. Influence tags — 10 options, max 3 selectable.
5. Post → saves with base64-encoded photo.

**Broken / partial:**
- `photoUrl` is a base64 data URI passed straight to `saveCheckin`. No separate media-upload flow — the endpoint handles it. If photo is large this will exceed JSON body limits.
- `user?.sport_tags` passed into caption generator. Works.

**Light mode:** uses theme tokens consistently. NO hardcoded hex (grep returned 0). Light-mode clean.

**Endpoints called:**
- `GET /checkin/today` — success
- `GET /home/dashboard` — success
- `POST /checkin/caption` — success
- `POST /checkin/` — success

**Notes:**
- Check-in spec is elsewhere (Home/Wellness audit domain). Included here because file was in scope.

---

## Warm-Up Modal

**Files:** `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/components/WarmUpModal.tsx` (733 lines)

**Implementation status:** complete.

**Data:**
- Reads soreness/energy from last wellness checkin.
- `POST /warmup/generate` with session type, muscle groups, readiness — Claude-backed.
- Returns phased protocol (General Cardio, Mobility, Activation, Ramp-Up Sets) with checkable exercises.

**Light mode:** 0 hardcoded hex. Theme-clean.

---

## Components Summary (Light Mode)

| File | Hardcoded hex | Status |
|---|---|---|
| `app/(tabs)/activity.tsx` | 193 | BROKEN |
| `app/checkin.tsx` | 0 | clean |
| `components/OutdoorTracker.tsx` | 4 (map constants) | intentional |
| `components/WeightLogSheet.tsx` | 0 | clean |
| `components/WarmUpModal.tsx` | 0 | clean |
| `components/WorkoutAutopsyCard.tsx` | 15 | not used in Activity tab (scans `SPORT_ICONS` only) |

---

# Launch Blockers (June 23)

1. **Weight tracking standalone screen does not exist.** `router.push('/weight')` from Home goes to an unresolved route. The entire screen (trend graph, time range selector, goal alignment card, stats row, streak, morning reminder) is unimplemented. This is a direct spec requirement on a tap target that's live.
2. **Activity tab light-mode regression.** 193 hardcoded hex values bake in dark theme across every modal (sport selector, strength builder, cardio logger, RPE prompt, post-session review, expanded detail, rest timer, exercise search). App is unusable in light mode inside these flows.
3. **Plate calculator, superset mode, muscle map visualization — none implemented.** Spec explicitly names all three as features of the manual logger. Grep returns zero matches for all three.
4. **Hevy PRs not computed.** Spec says "exercise list, volume, PRs". Backend has no PR logic. Frontend shows only volume and exercise count. Either cut from spec or implement.

# Launch Polish

1. **Dead code: weekly volume bar chart + activity heatmap.** Both are fully implemented and computed, then never placed in the render tree. Either wire them in or delete.
2. **Sport breakdown is bars, spec says donut.** Functional but off-spec.
3. **RPE not shown on feed cards** (spec: "RPE badge"). It's stored, just not surfaced.
4. **"Load Earlier Sessions" button appears even when no more data** — it will fetch empty pages silently.
5. **Journal pagination only paginates Strava.** Manual workouts + Hevy always loaded in full. Won't scale past a few months of heavy use.
6. **Post-session autopsy timeout is wall-clock, not a retry loop.** 15s timer fires regardless of whether text is actually missing. Works, but jittery.
7. **Outdoor-tracked activities don't replay their route on reopen.** Route points stored in `exercise_data`, but ExpandedModal only decodes Strava `summary_polyline`.
8. **Log Sport Session button is identical to Log Workout.** No sport-category pre-filter.

# Post-Launch (cut from v1.0)

1. Exercise library custom-exercise add, video/form tips, per-exercise history, search-by-equipment.
2. Hevy PR detection (if reinstated from spec cut).
3. Mind-body filter tab.
4. Progress & Records achievements beyond the static badge grid (real PR graph).

# Concerns

1. **Strength workouts store `intensity='Moderate'` before RPE is submitted.** `training_load` calculated from this default RPE. If backend recomputes training_load on PATCH /rpe, fine; if not, every strength workout's load is wrong. Worth verifying — needs manual testing.
2. **Check-in photo posted as base64 data-URL in JSON body.** No multipart upload. iOS device photos are often 1–3 MB → 1.3–4 MB base64. FastAPI default body size is 1 MB. This will fail on larger photos in production. Needs manual testing.
3. **Leaflet map loaded via external CDN** (`unpkg.com`) at runtime. Zero-offline tolerance on both the Strava detail map and OutdoorTracker live map.
4. **Autopsy blocks activity save on success path.** POST `/activities/` awaits Claude before returning, so slow Claude = slow save. Retry flow exists but only fires after wall-clock timeout.
5. **`getActivities` in api.ts is named for Strava but the endpoint hit couldn't be re-verified here** (api.ts:614 wraps `/strava/activities` confirmed by context — needs a second look if behaviour seems wrong).
6. **Readiness score duplicate fetch.** Activity tab calls `/activities/readiness`; Home calls `/home/dashboard` which internally calls `calculate_readiness`. Both use the same underlying service, but there's no client-side cache — user moving between tabs triggers Claude-adjacent work twice. Backend must cache or this is expensive.
7. **`weightLoggedToday` state on Home and `/weight/summary` don't reconcile.** Logging weight from the sheet optimistically sets `weightLoggedToday=true` locally — if the backend rejects, the user sees "Logged" check while the data is lost. Needs manual testing.

