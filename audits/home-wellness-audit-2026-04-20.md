# Home + Wellness Audit — 2026-04-20

Scope: `armen/mobile/app/(tabs)/index.tsx` (Home), `armen/mobile/app/(tabs)/wellness.tsx`, supporting components (GlassCard, AmbientBackdrop, WeightLogSheet), theme system, and backend endpoints they call. `app/(tabs)/dashboard.tsx` is registered with `href: null` in `_layout.tsx:180` — it is not reachable from the tab bar. Treated as dead code; included only as a short note.

Method: read each screen top to bottom, traced every imported component + API call, inspected backend router handlers for realness, grepped hardcoded hex vs theme tokens.

---

## Home Tab — Hero (readiness concentric ring)

**Files:** `armen/mobile/app/(tabs)/index.tsx` (260-352 `ConcentricHero`, 711-785 render)
**Implementation status:** complete (visually). Partial on data contract.
**Data:**
- `readiness_score`, `readiness_color`: real — `GET /home/dashboard` → `calculate_readiness(user_id)` in `app/services/readiness_service.py`. Single source of truth (matches spec).
- `weeklyLoadPct` inner ring: real — `weekly_load / (weekly_training_goal * 300)`. `300` is a client-side magic number (index.tsx:642).
- `readiness_delta_7d` (delta chip "+6% vs 7D"): **BROKEN**. Referenced in index.tsx:781 as `dashboard?.readiness_delta_7d ?? null`. The `DashboardData` type (services/api.ts:1004-1061) has no such field, and `routers/home.py` never returns it. Always `undefined` → delta chip never renders. Dead feature.
**Broken / partial:**
- Delta chip always hidden.
- `useCountUp` animation replays on every mount (no cacheKey — comment at line 285 acknowledges this).
**Missing from spec:**
- Spec: "weekly load + steps today as stats flanking the circle." Not built. Ring is standalone. Steps-today is fetched via pedometer and stored in state but never rendered on Home (index.tsx:635, 540-558).
**Light mode:** working — light halo stroke path at 302-307 explicitly for light mode, ring colors read from `theme` via `useTheme()`.
**Endpoints called:** `GET /home/dashboard`: success.
**Notes:** Hero visual quality is good. Steps-stat and delta chip are regressions vs spec.

---

## Home Tab — Vitals row (HRV / RHR / Sleep)

**Files:** index.tsx 358-394 `VitalTile`, 787-808 render.
**Implementation status:** complete
**Data:**
- `hrv_ms`, `resting_heart_rate`, `sleep_hours`: real — pulled from `DashboardData`. Backend source: `health_snapshots` for yesterday only (home.py:442-452). Will show `—` unless Apple HealthKit sync ran and there is a row for yesterday.
- `fetchLast7DaysHealthData()` pushes to `POST /health/snapshots` on iOS only on screen mount (index.tsx:528-533). Skipped silently on Android/web.
**Broken / partial:**
- "Connect Apple Health" CTA (index.tsx:801) is a `<TouchableOpacity>` with no `onPress`. Visual only. No deep link to settings, no HealthKit permission prompt.
- No WHOOP / Oura fallback on Home vitals (Wellness screen shows those; Home ignores them). Inconsistent.
**Missing from spec:** N/A.
**Light mode:** working — VitalTile uses `useTheme()`.
**Endpoints called:** none directly; fed by `/home/dashboard`.

---

## Home Tab — Strain gauge

**Files:** index.tsx 810-844.
**Implementation status:** partial.
**Data:**
- `todaySessionLoad`: real — `dashboard.last_session.training_load` when `last_session.date === today`. Only the single most-recent session counts; two sessions in a day under-reports.
- `dailyRecLoad`: hardcoded heuristic — `(weeklyLoadTarget / weeklyTrainingDays) * (score >= 70 ? 1.0 : 0.8)` (index.tsx:644).
**Broken / partial:**
- Only renders when `todaySessionLoad > 0`. Empty state is nothing — spec says the gauge should always be visible.
- Scale ticks 0/7/14/21 imply Whoop strain units, but the actual data is training-load arbitrary units. Mislabelled.
**Missing from spec:** always-visible state; meaningful units.
**Light mode:** uses `T.readiness.high`, `T.accent`, `T.signal.load` — should track theme.
**Endpoints called:** none directly.

---

## Home Tab — Quick action pills

**Files:** index.tsx 846-887.
**Implementation status:** complete.
**Data:** n/a.
**Broken / partial:** "Rest" pill calls `logRestDay()` → `POST /activities/rest` (real). Others navigate or open modals. All OK.
**Missing from spec:** none.
**Light mode:** pill surfaces use `t.glass.pill`, `t.accent`, `t.accentDim`. Works.
**Endpoints called:** `POST /activities/rest`: success.

---

## Home Tab — ORYX Intelligence card

**Files:** index.tsx 889-971, `ScanSweep` 403-440.
**Implementation status:** complete.
**Data:**
- `diagnosis_text`, `contributing_factors`, `recommendation`, `tone`, `generated_at`, `rate_limited`: real — `POST /home/diagnosis` (routers/home.py:622). Cached per day. Force-refresh supported with 1-hour server-side rate-limit returning a `rate_limited: true` cached payload.
- Headline/body split is regex in the client (index.tsx:903 `/^([^.!?]+[.!?])\s+(.+)$/s`). Fragile on edge cases.
**Broken / partial:**
- Spec says "OpenAI GPT-4o-mini." Confirmed in `claude_service.py:229` (`model="gpt-4o-mini"`).
- Spec says ≤300 tokens / 2 sentences / 1 recommendation — not verified in this audit (needs a sampling test).
- Rate-limit UX: refresh button dims with no user-visible explanation.
**Missing from spec:** none major.
**Light mode:** uses `t.glass.cardHi`, `t.text.primary`. BUT `ScanSweep` gradient is hardcoded lime `rgba(222,255,71,0.15)` — dark-mode accent. Light mode should use `theme.accent` (`#AACC00`). Minor visual issue.
**Endpoints called:** `POST /home/diagnosis`: success.

---

## Home Tab — Training card

**Files:** index.tsx 973-1136.
**Implementation status:** complete.
**Data:** `last_session`, `sessions_this_week`, `weekly_training_goal`, `current_streak`, `days_since_rest`, `weekly_load`, `last_week_load`, `four_week_avg_load`, `acwr`, `acwr_status` — all real, computed in `routers/home.py`. Backend logic is solid.
**Broken / partial:**
- Hardcoded hex throughout: `'#fff'` (986, 1065, 1069, 1094), `'#888'` (1024, 1030, 1097, 1118, 1131), `'#555'` (1120, 1130, 1132), `'#2a2a2a'` (1106, 1113). These will not flip in light mode.
- `getTrainingRecommendation()` (112-148) is a pure client-side if/else ladder. Duplicates the AI-generated `recommendation` from `/home/diagnosis`. Two recommendations shown to the user.
**Missing from spec:** none.
**Light mode:** needs work — hardcoded greys remain dark on light background.
**Endpoints called:** none directly.

---

## Home Tab — Nutrition snapshot (read-only summary)

**Files:** index.tsx 1138-1190.
**Implementation status:** complete (summary-only per scope).
**Data:** `calories_today`, `calorie_target`, `protein_today/_target`, `carbs_today/_target`, `fat_today/_target`, `meals_logged_today`: real, from `/home/dashboard`. Macro targets computed in `_compute_macro_targets(daily_calorie_target, primary_goal)`.
**Broken / partial:** Macro arc colors hardcoded (`'#ef4444'`, `'#f59e0b'`) (index.tsx:1167-1168). Empty state reads "No meals logged today" — functional.
**Missing from spec:** none.
**Light mode:** hardcoded macro colors won't adjust.
**Endpoints called:** none directly.

---

## Home Tab — Weight card (read-only summary)

**Files:** index.tsx 1192-1277.
**Implementation status:** complete.
**Data:** `weightHistory7d`: real — `GET /weight/history?days=7&range=7d`. `weightSummary`: real — `GET /weight/summary`. `weight_logged_today`: real — `/home/dashboard`.
**Broken / partial:** Heavy hardcoded hex — `'#555'`, `'#888'`, `'#c0392b'`, `'#fff'`, `CLR_GREEN`, `rgba(255,255,255,0.08)`, `rgba(39,174,96,0.12)` (1208-1273). Won't adapt to light mode.
**Missing from spec:** none (detail screen out of scope).
**Light mode:** needs work.
**Endpoints called:** `GET /weight/history`, `GET /weight/summary`: success.

---

## Home Tab — Wellness row (Hooper 1-7)

**Files:** index.tsx 1279-1301, modal 1337-1414.
**Implementation status:** complete and correct.
**Data:** `sleep_quality_today`, `fatigue_today`, `stress_today`, `muscle_soreness_today`, `wellness_logged_today`: real — `/home/dashboard`. Submit via `POST /wellness/checkin` with Hooper fields. Matches spec.
**Broken / partial:** `hooperHex(v)` bands `≤2 green / ≤4 amber / else red` — matches "lower = better" semantics.
**Missing from spec:** none.
**Light mode:** works — uses `t.glass`, `t.text`.
**Endpoints called:** `POST /wellness/checkin`: success.
**Notes:** Home uses Hooper 1-7 correctly. Wellness tab does NOT (see below).

---

## Home Tab — Weekly snapshot

**Files:** index.tsx 1303-1332.
**Implementation status:** complete, minor gaps.
**Data:** `sessions_this_week`, `weekly_training_goal`, `calories_this_week`, `current_streak` — all real.
**Broken / partial:** spec asks for "sessions, load, goal progress, calories this week." Load and explicit goal-progress are missing; streak stands in.
**Missing from spec:** load + goal progress %.
**Light mode:** pure theme-token styling — works.
**Endpoints called:** none direct.

---

## Home Tab — Readiness info modal

**Files:** index.tsx 1416-1470.
**Implementation status:** complete.
**Data:** `components_used`, `breakdown` — real from `/home/dashboard` (readiness_service).
**Broken / partial:** `breakdown[comp].score` is surfaced; `adjusted_weight` / `default_weight` are present in the type but never shown. Spec's dynamic-weight-redistribution is invisible to the user.
**Missing from spec:** weight-redistribution surfacing.
**Light mode:** mostly `t.`-tokens, but `rgba(255,255,255,0.04)` hardcoded in `infoIcon` (1930).
**Endpoints called:** none directly.

---

## Wellness Tab — full screen

**Files:** `armen/mobile/app/(tabs)/wellness.tsx`.
**Implementation status:** partial / stale. Predates the Hooper migration.
**Data:**
- `checkins`: real — `GET /wellness/checkins?days=7`.
- `whoopData`: real — `GET /whoop/data?days=7` (empty unless Whoop connected).
- `ouraData`: real — `GET /oura/data?days=7` (empty unless Oura connected).
- `snapshots`: real — `GET /health/snapshots?days=7`.
- `diagnosis`: real — `GET /diagnosis/daily` (separate from Home's `POST /home/diagnosis`). Different endpoint, different payload shape, different caching. claude_service.py also uses gpt-4o-mini here.
- `trends`: real — `GET /wellness/trends?days=30`.
**Broken / partial (critical):**
- **Hooper mismatch:** Wellness modal / card operate on legacy `{mood, energy, soreness}` 1-5 (wellness.tsx:100, 137-139, 155-160, 715). Spec and Home use Hooper `{sleep_quality, fatigue, stress, muscle_soreness}` 1-7. Submitting from Wellness writes legacy fields only. `wellness_logged_today` on dashboard only flips when all four Hooper fields are set (home.py:480-486) — check-ins made from the Wellness tab do NOT satisfy this. User checks in on Wellness, Home still shows "Log how you feel today."
- **Two readiness numbers:** Wellness card (230-279) shows `diagnosis.recovery_score` / `recovery_color` from `/diagnosis/daily`, not the `calculate_readiness` score used on Home. Different numbers for the same concept on two screens. Violates spec's "single source of truth."
- **Empty-recovery default:** `recoveryScore = diagnosis?.recovery_score ?? 0`, `recoveryColor = diagnosis?.recovery_color ?? 'yellow'` (180-183). Fresh users see "0/100 MODERATE RECOVERY" rather than a "no data" state.
- **Sleep Trends:** spec asks for 14-night BAR chart colored by duration. Current code renders a `LineChart` (582). Bars never built.
- **HRV Trends overlay:** spec asks for "current vs 7-day vs 30-day avg" three-line overlay. Current is a single plain line (526-544). Data (`seven_day_avg`, `thirty_day_avg`) is returned but not plotted.
- **Wellness History:** spec asks for stacked-area per Hooper component. Current is a monochrome line of totals (664-676).
- **Bedtime variance card:** shown behind a data-truthy check (598-608), but backend always returns `avg_bedtime_variance = None` (wellness.py:171 comment: "we don't store bedtime"). Branch never renders. Dead code.
- **Diagnosis duplication:** `/diagnosis/daily` hits OpenAI on every mount with no day-cache in the router. Wellness tab re-entries each rack up real LLM cost. Home's `/home/diagnosis` IS cached per day. Consolidate.
**Missing from spec:**
- Hooper check-in UI (1-7, four dimensions).
- Single-source "Readiness to Train" card pointing at `calculate_readiness`.
- Sleep bar chart.
- HRV 3-series overlay chart.
- Stacked-area Wellness History.
**Light mode:** **entirely broken.** ~100+ hardcoded hex values (`#0a0a0a`, `#1a1a1a`, `#111111`, `#f0f0f0`, `#555555`, `#888888`, `#27ae60`, `#c0392b`, `#e67e22`, `#FFFFFF`, `#FF6B35`, `#00B894`, `rgba(0,196,140,0.15)`, `#2a2a2a`, `#444`, `#222222`, etc.). Zero use of `useTheme()` or theme tokens. The entire screen stays dark in light mode. Launch blocker for light-mode parity.
**Endpoints called:**
- `GET /wellness/checkins`: success (returns legacy-field data).
- `POST /wellness/checkin`: success but writes legacy fields only.
- `GET /whoop/data`: usually empty.
- `GET /oura/data`: usually empty.
- `GET /health/snapshots`: success; empty for non-iOS users.
- `GET /diagnosis/daily`: success — duplicates Home, uncached, extra cost.
- `GET /wellness/trends`: success.
**Notes:** Biggest liability in scope. Needs a rewrite.

---

## Dashboard.tsx (not reachable)

**Files:** `armen/mobile/app/(tabs)/dashboard.tsx` (1293 lines).
**Implementation status:** dead — `_layout.tsx:180` sets `href: null`. Not linkable, not navigable.
**Notes:** Ships in the bundle. Imports DiagnosisCard, RecoveryIndicator, WorkoutAutopsyCard, SleepHRVChart — likely also dead unless referenced elsewhere. Recommend deletion post-launch.

---

## Theme system

**Files:** `armen/mobile/contexts/ThemeContext.tsx`, `armen/mobile/services/theme.ts`.
**Implementation status:** complete.
**Notes:**
- Both palettes well-specified. Light palette aligned to the Claude Design "ORYX Light" handoff (white cards, darker apple-green accent, cool-blue shadows).
- Live toggle works via `applyThemeInPlace` + `themeVersion` bump. Module-level `import { theme as T }` reads capture the palette at bundle-load time — these do NOT live-update. The theme file itself flags this; Appearance screen is expected to warn users. Home mixes context-based styles (reactive) with module-level `T.*` (frozen). Expect half-and-half appearance when toggling mid-session. Needs manual testing.
- Wellness screen doesn't consume the theme at all.

---

## Components imported by Home

- **GlassCard** (`components/GlassCard.tsx`): fully theme-aware. Solid-white + shadow in light; translucent + blur + rim in dark. Production-grade.
- **AmbientBackdrop** (`components/AmbientBackdrop.tsx`): theme-aware radial glow canvas, different palette per scheme. Solid.
- **WeightLogSheet**: not deeply inspected (activity agent owns full weight flow); wired to `logWeight` → `POST /weight/log`.

---

# Summary

## Launch blockers (June 23)

1. **Wellness tab Hooper mismatch.** Submit form uses legacy `mood/energy/soreness` 1-5; Home + `calculate_readiness` use Hooper 1-7. Writes from Wellness are invisible to Home/readiness. `wellness.tsx:100, 137, 155, 715`.
2. **Two readiness numbers.** Home = `calculate_readiness`. Wellness = `/diagnosis/daily.recovery_score`. Spec requires single source. `wellness.tsx:180-183, 230-279`.
3. **Wellness tab light mode entirely broken.** No theme-token usage at all; 100+ hardcoded hex.
4. **Duplicate AI diagnosis endpoints.** `/home/diagnosis` (cached per day) vs `/diagnosis/daily` (uncached). Both hit OpenAI. Pick one.
5. **`readiness_delta_7d` ghost field.** UI reads it; backend never returns it; delta chip never renders. `index.tsx:781`.

## Launch polish

- Home training card hardcoded greys (`#fff`, `#888`, `#555`, `#2a2a2a`) — won't respect light mode.
- Home nutrition card hardcoded macro colors (`#ef4444`, `#f59e0b`) — route through a macro token set.
- Home weight card many hardcoded colors; light-mode inconsistent.
- Strain gauge ticks (0/7/14/21) imply Whoop units; data is raw training load. Fix labels or hide. Also: spec wants gauge always visible; currently hidden when no session logged.
- ORYX Intelligence scan-sweep hardcoded lime `rgba(222,255,71,0.15)` — should pull from `theme.accent`.
- HRV Trends: draw 7d + 30d average as overlay guide lines (data already present).
- Sleep Trends: implement 14-night bar chart as per spec.
- Wellness History: stacked area per Hooper component, not totals line.
- `useCountUp` needs `cacheKey` so the hero number doesn't replay on every mount.
- "Connect Apple Health" CTA has no `onPress` — add HealthKit permission flow or deep link.
- Readiness info modal: surface `adjusted_weight` vs `default_weight` so dynamic redistribution is visible.
- Diagnosis rate-limit UX: explain why the refresh button is disabled when `rate_limited=true`.

## Post-launch (cut from v1.0)

- Delete unreachable `dashboard.tsx` and any components only used there.
- Consolidate client-side `getTrainingRecommendation` vs AI `recommendation` — single source.
- Server-side `weeklyLoadTarget` instead of client `days * 300`.
- Retire legacy `{mood, energy, soreness}` fields after a dual-write cycle.
- Bring steps-today into the hero as per spec.
- Persist bedtime in `HealthSnapshot` so the bedtime-variance card gets data.

## Concerns (security / architecture / perf)

- **Architecture (major):** Two AI diagnosis endpoints hitting OpenAI with overlapping inputs. `/diagnosis/daily` has no day-cache; Wellness tab mounts cost real tokens. Consolidate.
- **Architecture:** Theme has a known "module-level vs context" split; Home mixes both. Mid-session toggles produce a hybrid screen until app restart.
- **Data integrity:** Hooper-vs-legacy field drift means `wellness_logged_today` disagrees with Wellness tab's own notion of "logged today." Users see stale "log today" CTAs on Home after checking in on Wellness.
- **Perf:** Wellness mount runs 6 parallel endpoints via `Promise.allSettled`; `/diagnosis/daily` is the slow one (LLM) and gates the single `setLoading(false)`. No granular skeleton.
- **Perf / verify:** `calculate_readiness` called on every `/home/dashboard` response. Spec promises 1h cache. Not verified in this audit — needs a look at `readiness_service.py`.
- **Security:** `_openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)` is instantiated at module import (claude_service.py:14). If the key is missing at boot, the server may fail to start even for users who never call diagnosis. CLAUDE.md says Anthropic is optional (503s) but OpenAI is not gated the same way. Confirm behaviour.
- **Security:** 401s from `/home/diagnosis` are silently swallowed — mid-session token expiry yields a blank card with no re-auth prompt.
- **Testing gap:** No unit tests on `strainPct`, `dailyRecLoad`, `getTrainingRecommendation`, trend-direction flags — all of which are spec-critical.
