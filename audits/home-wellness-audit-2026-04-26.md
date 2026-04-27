# Home + Wellness Audit — 2026-04-26

## Status: in progress

Reference: prior audit `/Users/armenkevorkian/Desktop/ORYX/ORYX/audits/home-wellness-audit-2026-04-20.md`. Method: re-read each screen + traced API calls + grepped for hardcoded hex.

---

## Home Tab — Hero (concentric ring)

**Files:** `armen/mobile/app/(tabs)/index.tsx` (270-358 `ConcentricHero`).
**Implementation status:** complete.
**Data:**
- `readiness_score`, `readiness_color`: real — `GET /home/dashboard` → `calculate_readiness()`. Single source of truth.
- `weeklyLoadPct` inner ring: still `weekly_load / (weekly_training_goal * 300)`. **STILL BROKEN** — magic `300` lives client-side (index.tsx still references this — confirmed below).
- `readiness_delta_7d` chip: **FIXED**. Backend now computes and returns it in `routers/home.py:644`. Logic at home.py:613-620 looks up the user's `Diagnosis.readiness_score` from ≥7 days ago and subtracts. Caveat: source is *Diagnosis* table, not the canonical `calculate_readiness` history — if the user hasn't generated a diagnosis 7d ago the delta is `null` and chip stays hidden.
- `useCountUp` now takes a `cacheKey` argument (index.tsx:292-293, `'home:readiness-score'` / `'home:readiness-load'`). **FIXED** — count-up no longer replays on every mount.
**Light mode:** working — light halo path at 308-313 explicit; ring colors via `useTheme()`. `CLR_PALETTE` is getter-backed (index.tsx:55-61) so live theme toggle works.
**Endpoints:** `GET /home/dashboard`: success.

---

## Home Tab — Vitals row (HRV / RHR / Sleep)

**Files:** index.tsx 364-400 `VitalTile`, 797-821 render.
**Implementation status:** complete.
**Data:** `hrv_ms`, `resting_heart_rate`, `sleep_hours` from `/home/dashboard` (yesterday's `health_snapshots` row, home.py:486-489).
**FIXED:** "Connect Apple Health" CTA — now navigates to `/settings` via `router.push('/settings')` (index.tsx:813). Previously had no `onPress`. Verify the settings screen actually contains a HealthKit permission flow (out of audit scope).
**STILL BROKEN:** Renders only when *all three* are missing (`allMissing` at index.tsx:801) — partial-data users (e.g. only sleep) get no nudge to connect for missing fields.
**Light mode:** working — VitalTile uses `useTheme()`.

---

## Home Tab — Strain gauge

**Files:** index.tsx 823-857.
**Implementation status:** partial. NEW evidence:
- `dashboard?.last_session?.date?.startsWith(todayISO())` at index.tsx:654 — comment confirms a real bug was fixed (full ISO timestamp vs date string). Good.
**STILL BROKEN:**
- Only renders when `todaySessionLoad > 0` (index.tsx:824) — empty state hidden, contradicts spec.
- Hardcoded ticks `0/7/14/21` (index.tsx:851-854) imply Whoop strain units; data is raw training load. Mislabelled.
- `dailyRecLoad = (weeklyTrainingDays * 300 / weeklyTrainingDays) * 0.8|1.0` = literally `300 * 0.8|1.0` (240 or 300). The whole `weeklyLoadTarget = days * 300` collapses. Magic number `300` (index.tsx:648) is a single per-day load constant for every athlete; spec asks for personalised targets.
**Light mode:** uses theme tokens via gradient on `T.signal.load`/`T.readiness.high`/`T.accent` (832).

---

## Home Tab — Quick action pills

**Files:** index.tsx 859-900.
**Implementation status:** complete. Same as prior audit. Pills route through theme tokens.

---

## Home Tab — ORYX Intelligence card

**Files:** index.tsx 902-984, `ScanSweep` 409-447.
**Data:** `POST /home/diagnosis` is the canonical endpoint and is cached per day (home.py:709-733). Force-refresh has 1h server-side rate-limit. Confirmed gpt-4o-mini at home.py:774 with `max_tokens=300` (matches spec).
**STILL BROKEN:** `ScanSweep` gradient at index.tsx:439 hardcodes lime `rgba(222,255,71,0.15)` — dark-mode accent. Light-mode users get an invisible/wrong sweep. Should use `theme.accent` rgba.
**STILL BROKEN:** Headline/body split regex at index.tsx:916 still fragile (no fallback prose for malformed responses without sentence punctuation).
**Light mode:** mostly theme tokens; ScanSweep is the one offender.

---

## Home Tab — Training card

**Files:** index.tsx 986-1149.
**Implementation status:** complete; **light mode mostly FIXED**.
- The `'#fff'`, `'#888'`, `'#555'`, `'#2a2a2a'` hardcoded greys flagged in prior audit have been replaced with theme tokens (`t.text.primary`, `t.text.secondary`, `t.text.muted`, `t.divider`, `t.glass.border`). Verified at index.tsx:1107-1131 and createStyles 1813-1837.
**STILL BROKEN:**
- `getTrainingRecommendation()` (117-153) duplicates the AI `recommendation` from `/home/diagnosis`. Two recommendations shown.
- `rpePill.backgroundColor: 'rgba(255,255,255,0.04)'` (index.tsx:1824) — still hardcoded for dark mode.

---

## Home Tab — Nutrition snapshot

**Files:** index.tsx 1151-1203.
**STILL BROKEN:** macro arc colors `'#ef4444'` (protein) and `'#f59e0b'` (carbs) hardcoded (index.tsx:1180-1181). Won't adjust to light mode.
**Other improvements:** Backend now sources macro targets from cached nutrition_service first (home.py:296-302), only falling back to the heuristic split — better single-source-of-truth.

---

## Home Tab — Weight card

**Files:** index.tsx 1205-1290.
**STILL BROKEN:**
- Hardcoded `'rgba(39,174,96,0.12)'` and `'rgba(255,255,255,0.08)'` for the Log/Logged chip background (index.tsx:1239). Won't flip in light mode.
- Most other prior-audit hardcoded hex (`#555`, `#888`, `#c0392b`, `#fff`) have been replaced with `T.text.muted/secondary/primary` and `T.status.danger`. Partially FIXED.

---

## Home Tab — Wellness row (Hooper 1-7)

**Files:** index.tsx 1292-1314, modal 1350-1427.
**Implementation status:** complete and correct. Uses `HOOPER_FIELDS` (index.tsx:450-455) and submits 4-field Hooper payload (index.tsx:611-619).
**Endpoints:** `POST /wellness/checkin`: success — backend persists Hooper + invalidates readiness cache (wellness.py:33-36, 59).

---

## Home Tab — Weekly snapshot

**Files:** index.tsx 1316-1345.
**STILL BROKEN:** spec asks for "sessions, load, goal progress, calories this week." Card shows sessions/calories/streak. Load and goal-progress % still missing.

---

## Home Tab — Readiness info modal

**Files:** index.tsx 1429-1483.
**STILL BROKEN:**
- `adjusted_weight` / `default_weight` from breakdown still not displayed (only `score`). Dynamic weight redistribution invisible.
- `infoIcon.backgroundColor: 'rgba(255,255,255,0.04)'` hardcoded (index.tsx:1943).

---

## Wellness Tab — full screen

**Files:** `armen/mobile/app/(tabs)/wellness.tsx`.
**Implementation status:** still broken — partial fixes since 04-20.

### FIXED since 04-20
- Theme tokens now used throughout wellness.tsx — the ~100 hardcoded hex values are gone, replaced with `T.bg.primary`, `T.text.*`, `T.glass.*`, `T.status.*`. Light-mode parity *partially* improved.
- `/diagnosis/daily` retired: backend returns 410 Gone (diagnosis.py:107-116). Client `getDailyDiagnosis()` (api.ts:719-722) was redirected to `POST /home/diagnosis`. Endpoint deduplication ✓.

### NEW BROKEN (regression introduced by partial fix)
- **Recovery card always shows 0 / yellow** — `getDailyDiagnosis()` now hits `/home/diagnosis` which returns `{diagnosis_text, contributing_factors, recommendation, tone}` — *not* `{recovery_score, recovery_color}` (the old `/diagnosis/daily` shape). `wellness.tsx:181-183` reads `diagnosis?.recovery_score ?? 0` and `recovery_color ?? 'yellow'`. Both are undefined on the new payload, so every user sees `0/100 MODERATE RECOVERY` regardless of state. The whole recovery card on the Wellness tab is non-functional. Worse than 04-20 (used to render *some* number from the old endpoint). `services/api.ts:101-106` `DiagnosisResult` interface is now lying about what the wire payload contains.

### STILL BROKEN
- **Hooper mismatch** — form state still `{mood: 3, energy: 3, soreness: 3}` 1-5 (wellness.tsx:101, 138-139, 158-160, 716). Submit at l.156-162 sends only legacy fields. `wellness_logged_today` on the dashboard checks all 4 Hooper fields (home.py:573-577) — Wellness-tab check-ins still don't satisfy it. User checks in on Wellness, Home keeps showing "Tap to log how you feel today."
- **Two readiness numbers** — even after the redirect, the Wellness card surfaces a number that's not `calculate_readiness`. Now it's *always* 0. Single-source-of-truth violation persists.
- **Sleep Trends** — still `LineChart` (wellness.tsx:583), spec asks for 14-night BAR chart.
- **HRV Trends overlay** — still single line (wellness.tsx:531-543); the `seven_day_avg` / `thirty_day_avg` numbers are surfaced as stats but never plotted as overlay guide lines.
- **Wellness History** — still monochrome line of totals (wellness.tsx:665-676). Spec asks for stacked-area per Hooper component.
- **Bedtime variance** — backend still hardcodes `avg_bedtime_variance = None` (wellness.py:171). UI branch at wellness.tsx:599-609 never renders. Dead code.
- **No `useTheme()` hook** — wellness.tsx still imports `theme as T` (frozen module-level) at l.35; no context-based reactive styling. Mid-session theme toggles produce a half-and-half screen until restart.

---

## Dashboard.tsx (not reachable)

**Files:** `armen/mobile/app/(tabs)/dashboard.tsx`, 1293 lines, registered with `href: null` in `_layout.tsx`. Still dead code shipping in the bundle. STILL BROKEN (not deleted).

---

## Theme system

**Files:** `armen/mobile/contexts/ThemeContext.tsx`, `armen/mobile/services/theme.ts`.
- Live toggle works for components consuming `useTheme()`. `CLR_PALETTE` getter pattern in index.tsx (55-61) ensures Home's color references update on toggle.
- Wellness.tsx still uses module-level `T` only — known split.

---

## Backend perf / cache

- **FIXED:** `calculate_readiness` cache. `_CACHE_TTL_SECONDS = 3600` (1h), invalidated on wellness check-in via `invalidate_readiness_cache` (readiness_service.py:51, 67-77, 178-181, called from wellness.py:59). Prior audit flagged this as "needs verification"; verified.
- **FIXED:** `readiness_delta_7d` returned at home.py:644 (computed at home.py:613-620 from `Diagnosis.readiness_score`). Note: the comparison source is the Diagnosis table snapshot, not a dedicated readiness history table — so users without a 7-day-old diagnosis row get `null`.
- **STILL CONCERN:** `/home/diagnosis` invokes `_build_dashboard` (home.py:737) which itself awaits `calculate_readiness`. That call uses cache, so cheap. OK.
- **STILL CONCERN:** Wellness mount triggers `Promise.allSettled` over 6 endpoints including `getDailyDiagnosis` → `/home/diagnosis`. Mount path now generates an LLM call from the Wellness tab, which then writes/updates the per-day cached `Diagnosis` row that Home reads. Possible double-LLM cost on first daily session if Wellness mounts before Home (re-uses cache after that, but the entry vector is now Wellness rather than Home).

---

## Summary — changes since 04-20

1. `readiness_delta_7d` now wired end-to-end (FIXED).
2. `useCountUp` cacheKey added — hero number no longer replays on every mount (FIXED).
3. `/diagnosis/daily` retired (410); client redirected to `/home/diagnosis` (FIXED) — but introduced a NEW BUG: Wellness recovery card now permanently reads `0/yellow` because the response shape doesn't include `recovery_score`/`recovery_color`.
4. Wellness tab adopted theme tokens (no more 100+ hardcoded hex). Home training card hardcoded greys removed. Light-mode parity substantially improved (Home good; Wellness partial — still uses module-level `T`).
5. Readiness 1h cache + invalidation verified in `readiness_service.py`.
6. Apple Health CTA now navigates to `/settings` (FIXED — partial; only renders when *all* vitals missing).

## Still broken (launch blockers)

- **NEW: Wellness recovery card always shows 0/yellow** — payload shape mismatch.
- **STILL: Wellness Hooper mismatch** — form is 1-5 mood/energy/soreness; Home/readiness is 1-7 Hooper. Wellness check-ins remain invisible to Home.
- **STILL: Wellness Sleep/HRV/Hooper trend charts don't match spec** (line vs bar; no 3-series overlay; no stacked-area).
- **STILL: dashboard.tsx dead code in bundle.**
- **STILL: weeklyLoadTarget = days * 300 magic number** at index.tsx:648 (collapses inside dailyRecLoad).

## Status: complete



