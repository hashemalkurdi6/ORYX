# Activity Tab Fixes — 2026-04-26

Working from `audits/activity-audit-2026-04-26.md`.

## 1. Sport breakdown → donut chart
- `armen/mobile/app/(tabs)/activity.tsx`: imported `Svg, Circle, G` from `react-native-svg`; replaced the horizontal-bar markup with an SVG donut + legend. Each `sportBreakdown` slice renders as a stroked circle segment using the entry's themed color; the legend below shows swatch + label + percent.
- Added `donutRow / donutLegend / donutSwatch / donutLegendLabel / donutLegendPct` styles. Old `breakdownRow / breakdownBarBg / breakdownBarFill` styles left intact (still used elsewhere or can be cleaned later).

## 2. Strength save defers until RPE
- `activity.tsx`: `handleStrengthComplete` no longer calls `logActivity`. It now only transitions `logStep -> 'rpe'`.
- New `saveStrengthWorkout(rpe)` is called from `handleRpeSubmit` / `handleRpeSkip` for strength-category sessions; intensity is derived via `intensityFromRpe(rpe)` (1–3 Easy / 4–6 Moderate / 7–8 Hard / 9–10 Max), and `rpe` goes in the payload directly so the backend's `_compute_training_load` uses it instead of the intensity fallback.
- `pendingRpeActivityId` flow preserved for cardio (which still saves before RPE because intensity is collected on the cardio form).

## 3. Morning reminder toggle on weight screen
- Backend: added `weight_reminder_enabled BOOLEAN` and `weight_reminder_time VARCHAR(5)` columns on `users` (model + `_USER_COLUMN_MIGRATIONS` in `main.py`). `WeightSettingsIn` now accepts both fields; `update_weight_settings` validates `HH:MM`; `get_weight_summary` echoes the current values.
- API client: extended `WeightSummary` with optional `weight_reminder_enabled / weight_reminder_time`; `updateWeightSettings` now overloaded to accept either a unit string (legacy) or a `WeightSettingsPatch` object.
- `app/weight.tsx`: added a "MORNING REMINDER" card with a `Switch` and a normalized HH:MM `TextInput`. State mirrors the backend via `summary`; toggling/committing time persists optimistically.

## 4. "Load Earlier Sessions" hasMore
- `activity.tsx`: added `extraWeeks` state. `flatListData` now uses `MAX_WEEKS = 8 + extraWeeks`. `handleLoadEarlier` reveals 4 more local weeks first if available; only when local weeks are exhausted does it page Strava. Strava paging now also flips `hasMoreStrava` to false when a returned page yields zero new (deduped) items, preventing endless empty fetches near end-of-list.

## 5. Superset visual grouping
- StrengthBuilder render: detects contiguous exercises sharing a `supersetGroup` and (a) inserts a "SUPERSET A/B/C/D" mini-header above the first member, (b) indents and applies `borderLeftWidth: 2 / borderLeftColor: T.accent` on each grouped card so the run reads visually as one bracketed unit. The existing SS·X pill remains the toggle.
- Added `exerciseCardInSuperset / supersetHeader / supersetHeaderBar / supersetHeaderText` styles.

## 6. Check-in photo → multipart `/media/upload`
- `app/checkin.tsx`: dropped `base64: true` from `ImagePicker.launchCameraAsync` and stopped capturing `photoBase64` from the asset. `handlePost` now calls `uploadMedia(photoUri)` to get the hosted URL and passes that into `saveCheckin({ photo_url })`. On upload failure we surface an alert and bail before saving the check-in (avoids silent failure).

## 7. Hardcoded chart-kit hex literals
- Added a module-level `toRgba(color, opacity)` helper.
- Line 2387 (weekly volume bars): `rgba(222,255,71,o)` → `toRgba(T.accent, o)` so the bars track the active theme accent.
- Line 2731 (top-level `chartConfig`): `rgba(224,224,224,opacity)` → `toRgba(T.text.secondary, opacity)`.
- Strava brand `#FC4C02` left as-is (intentional brand). Scrim `rgba(0,0,0,0.6)` overlays left as-is (works in both modes). Leaflet body `#0a0a0a` left as-is (HTML constant inside the WebView).
