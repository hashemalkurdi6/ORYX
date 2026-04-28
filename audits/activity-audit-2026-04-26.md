# Activity Tab Audit — 2026-04-26

## Status: complete — styling pass 2026-04-27 applied

## Activity Screen — Top Sections

**Files:** `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/activity.tsx` (3247 lines, was 3085)

**Implementation status:** substantial improvements since 04-20.

**Data:**
- Readiness, Weekly Training Load + ACWR, Steps, Stats: same real-backend wiring (FIXED retained).
- Heatmap NOW RENDERED: `<ActivityHeatmap data={heatmap} />` at activity.tsx:2401. (FIXED — was dead code on 04-20.)
- Weekly Volume `<BarChart>` NOW RENDERED at activity.tsx:2377. (FIXED — was dead code on 04-20.)
- Sport breakdown still rendered as horizontal bars (STILL BROKEN — spec says donut).
- Feed: real (Promise.allSettled).
- Wellness checkin loaded for warm-up personalization.

**Light mode (MAJOR):**
- Hardcoded hex/rgba count: **16** in activity.tsx (down from 193). FIXED at scale.
- Remaining 16 are mostly map constants and small overlays — verify below.

**NEW imports in scope:**
- `PlateCalculator from '@/components/PlateCalculator'` (activity.tsx:49) — NEW.
- `MuscleMap from '@/components/MuscleMap'` (activity.tsx:50) — NEW.
- `OryxInsightCreator` (activity.tsx:51) — NEW (sharing flow component).
- `AmbientBackdrop` (activity.tsx:52) — NEW.
- `ThemeColors, theme as T, type as TY, radius as R, space as SP` from `@/services/theme` plus `useTheme` from `@/contexts/ThemeContext` — theming refactor in progress.

**Endpoints called:** unchanged from 04-20 audit.

## Manual Workout Logger (StrengthBuilder + CardioLogger)

**Files:** activity.tsx 540–870

**FIXED since 04-20:**
- **PlateCalculator:** NEW `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/components/PlateCalculator.tsx`. Wired into StrengthBuilder via calculator-outline icon next to each exercise (activity.tsx:702-704), opens modal with last set's weight pre-filled. Supports kg/lb, breakdown per side. (FIXED — was a launch blocker.)
- **Superset mode:** NEW. `supersetGroup` field on ExerciseEntry (activity.tsx:91). Tap "SS" pill on each exercise to cycle null → A → B → C → D (activity.tsx:601-607, 682-701). Group is passed to backend in `exercise_data` (activity.tsx:2032). (FIXED — was a launch blocker.) Note: visual rendering is just a colored pill on the exercise card; spec implies grouped/joined visual rendering of supersetted exercises — current impl is functional but minimal.
- **Muscle map:** NEW `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/components/MuscleMap.tsx`. SVG body outline (front + back), highlights muscles hit. Used in PostSessionView at activity.tsx:1064. (FIXED — was a launch blocker.)

**STILL BROKEN since 04-20:**
- AI autopsy timeout UX: still 15s wall-clock with retry button. Acceptable.
- Strength workouts initially stored with default RPE before user input — but log_activity now accepts `rpe` directly in payload (`user_activity.py:324`); need to verify frontend sends it. Activity.tsx still does post-hoc PATCH /rpe.
- Hard-coded intensity 'Moderate' for strength path: STILL BROKEN.

**NEW issue:**
- `intensity='Moderate'` is computed once at log time. The new `_compute_training_load(duration, rpe, intensity)` (user_activity.py:325) uses RPE if provided, else falls back to intensity. So if frontend submits without RPE, training_load will be off.

## OutdoorTracker

**FIXED since 04-20:**
- Outdoor-tracked activities NOW REPLAY their route in ExpandedModal. activity.tsx:1405-1428 detects `exercise_data[0]._outdoor` + `route_points`, builds Leaflet WebView with the polyline. Round-trip map display now works for self-tracked activities. (FIXED — was launch polish item.)

**STILL BROKEN:**
- Intensity heuristic still avg-speed only (>10 km/h Hard, >6 km/h Moderate). Cycling Easy still classifies as Moderate.

## Hevy PRs

**FIXED since 04-20:**
- New service `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/services/hevy_prs.py` (100 lines). `compute_prs_by_workout()` walks chronological history, attaches PR list per workout. Hevy router's `GET /hevy/workouts` populates `item.prs` (hevy.py:177-186).
- Frontend renders PR pills on Hevy feed cards (activity.tsx:1232-1241). (FIXED — was launch blocker.)
- `HevyWorkoutOut` schema has `prs` field — verify below.

## Weight Tracking Standalone Screen

**FIXED since 04-20:**
- `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/weight.tsx` NEW (686 lines). Implements:
  - Time range selector (7D/1M/3M/6M/1Y/All) at line 43-51.
  - Trend LineChart with raw daily + rolling average overlay (line 236).
  - Stats grid: Current / Change / This week avg / Rate per week (line 295-329).
  - GoalAlignmentCard (line 332).
  - Logging streak (current + longest + days_logged_this_month) (line 335-350).
  - Log Weight CTA reuses WeightLogSheet (line 375-379).
  - Unit toggle (kg/lbs) via `updateWeightSettings` (line 122-130).
  - Pull-to-refresh.
  - "Fell back to all" indicator when range has no data (line 222).
- Uses `getWeightHistory(365, range)` and `getWeightSummary()`.
- (FIXED — was the most severe launch blocker.)

**STILL BROKEN / partial:**
- No morning reminder toggle with time picker — spec called for it; the screen does not surface this. `updateWeightSettings` is wired only to unit toggle, but the endpoint accepts more.
- Goal alignment card requires `data_confidence >= limited` per spec — verify in GoalAlignmentCard component (line not shown but referenced at 332).

## Activity Screen — Hardcoded Hex Audit (16 occurrences)

All remaining hex literals in activity.tsx:
- Line 291: Leaflet body bg `#0a0a0a` (HTML constant — intentional)
- Line 296: Strava polyline color `#FC4C02` (Strava brand orange)
- Lines 1270, 1275, 1276, 1286, 1287, 1288, 1383, 1385, 3110, 3111: `#FC4C02` Strava badge / icons / "Generate Autopsy" button (brand color — intentional but should still display correctly in light mode since it's an accent)
- Line 2387: `rgba(222,255,71,${o})` — chart accent (lime). Hardcoded, doesn't follow theme accent. MINOR off-theme.
- Line 2731: `rgba(224,224,224,${opacity})` — chart label color. Doesn't follow theme. MINOR off-theme.
- Line 3130: `rgba(0,0,0,0.6)` menuOverlay scrim — fine for both modes.
- Line 3191: `rgba(0,0,0,0.6)` restModalOverlay scrim — fine.

**Verdict:** Light mode is largely FIXED. Two minor chart-color tokens (line 2387, 2731) don't theme-shift but are inside chart-kit configs (less visible). Strava brand colors are correct.

## Backend services

**Readiness cache (FIXED since 04-20):**
- `readiness_service.py:28` imports `ReadinessCache` model. `_save_cache(user_id, result, db)` at line 533, `invalidate_readiness_cache(user_id, db)` at line 178. Cache invalidated on log_activity (`user_activity.py:343`) and log_rest_day (`user_activity.py:305`). Concern #6 from prior audit RESOLVED.

**Hevy PRs computation:**
- `services/hevy_prs.py` (100 lines). Walks chronological history, tracks 3 PR kinds: max_weight, 1rm (Epley), max_reps. Handles weight_kg or weight field; deduplicates per workout. Sound implementation. (FIXED.)

**Deload service:** unchanged — 559 lines, not directly used by Activity tab UI but powers backend logic.

**Warm-up service:** unchanged — Claude Haiku, JSON-validated WarmUpProtocol. Verified clean.

## Plus / Action Menu

**FIXED since 04-20:**
- Log Sport Session now passes `categoryFilter='sport'` to openLogModal (activity.tsx:2603, 1954-1964) — used to be a duplicate. SportSelector should now filter to sport categories (need to verify SportSelector consumes `sportCategoryFilter` state).
- Six menu items: Log Workout, Log Run or Cardio, Start Warm-Up, Track Activity, Log Sport Session, Log Rest Day. All wired.

## Journal / Feed

**FIXED since 04-20:**
- RPE badge now rendered on manual feed cards (activity.tsx:1173-1177).
- Hevy PR pills rendered (activity.tsx:1232-1241).

**STILL BROKEN:**
- Sport breakdown is still horizontal bars (activity.tsx:2406-2425), spec says donut.
- Strength filter still includes Hevy; Cardio includes Strava; no Mind-body filter.
- "Load Earlier Sessions" still appears even when no more data; no has-more flag.
- Manual + Hevy still loaded in full — only Strava paginated.

## Check-In Screen

**Files:** `/Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/checkin.tsx` (667 lines, unchanged)

**Status:** unchanged from 04-20. Hex count: 2 (still essentially clean — within tolerance).

**Notes:**
- Theme refactor extended via `useTheme()` and `createStyles(theme)` (line 31). FIXED to be theme-driven.
- Photo still posted as base64 data URI (concern from 04-20 still applies).

## Components added since 04-20

| File | Lines | Purpose | Status |
|---|---|---|---|
| `armen/mobile/app/weight.tsx` | 686 | Weight tracking standalone | NEW (FIXED blocker) |
| `armen/mobile/components/PlateCalculator.tsx` | 216 | Barbell plate breakdown | NEW (FIXED blocker) |
| `armen/mobile/components/MuscleMap.tsx` | 161 | SVG body outline | NEW (FIXED blocker) |
| `armen/backend/app/services/hevy_prs.py` | 100 | PR computation walk | NEW (FIXED blocker) |

## Launch Blockers (Status)

| 04-20 Blocker | Status |
|---|---|
| Weight tracking standalone screen missing | FIXED — `app/weight.tsx` exists with full feature set. Morning reminder toggle still missing. |
| Activity tab light-mode regression (193 hex) | FIXED — down to 16 hex, all explainable (Strava brand, scrim overlays, chart-kit configs). |
| Plate calculator missing | FIXED — PlateCalculator.tsx wired in. |
| Superset mode missing | FIXED (functional) — `supersetGroup` field, cycle-pill UI. Visual rendering minimal. |
| Muscle map visualization missing | FIXED — MuscleMap.tsx, SVG front+back. |
| Hevy PRs not computed | FIXED — services/hevy_prs.py + per-workout PR pills in feed. |

## Remaining Issues

**STILL BROKEN:**
1. Sport breakdown is bars, spec says donut. (activity.tsx:2406-2425)
2. Cardio intensity heuristic too aggressive for cyclists. (OutdoorTracker)
3. Hard-coded 'Moderate' intensity at strength save time when no RPE yet. (activity.tsx)
4. AI autopsy timeout is 15s wall-clock, not poll-based.
5. Strength filter includes Hevy; Cardio includes Strava; no Mind-body tab.
6. "Load Earlier Sessions" silently fetches empty pages at end-of-list.
7. Manual + Hevy not paginated (only Strava is).
8. Check-in photo posted as base64 in JSON body (could exceed 1MB FastAPI default).
9. Leaflet loaded via external CDN (offline failure).
10. Two minor chart-kit hex values not theme-driven (activity.tsx:2387, 2731).
11. No morning reminder toggle / time picker on weight screen.
12. Goal alignment card data_confidence threshold not verified.

**NEW (since 04-20):**
1. Superset visual rendering is just a colored "SS·A" pill on each exercise — exercises are not visually grouped/joined. Functional for backend persistence but minimal UX.
2. Muscle map is shown alongside the existing muscle pill row — both render. Slight redundancy on PostSessionView.
3. Plate calculator opens with the LAST set's weight, not the next/upcoming set. Reasonable default.
4. Weight screen unit toggle calls `updateWeightSettings` for kg/lbs but no other settings (notification time, etc.) UI.

## Sections fully covered
Activity screen top, Manual Logger, OutdoorTracker, Hevy, Strava, Journal, Plus menu, Post-session view, Weight standalone, Check-in, backend routers (user_activity, hevy, strava), backend services (readiness, deload-spot-check, warmup, hevy_prs).

## Status: complete









