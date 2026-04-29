# Calorie target inconsistency between survey and Nutrition tab

**Status:** Investigation only — no code changes proposed yet. Awaiting approval before fix.

## Root cause

There is **no single source of truth** for the user's daily calorie target. Four problems compound:

1. **The mobile app computes TDEE during signup with a different formula than the backend.** Signup posts the result to the backend, which stores it verbatim. The backend's own formula is only run later (lazily, on first read of `/nutrition/targets` or `/nutrition/today`), and it produces a *different* number — which silently overwrites the User row.
2. **There are two storage locations** for the same value: `users.daily_calorie_target` and `nutrition_targets.daily_calorie_target`. They are not always in sync.
3. **Different endpoints read from different storage locations**, so what the user sees on Home, Nutrition, and the AI prompts can diverge.
4. **The survey edit endpoint (`PATCH /nutrition/profile`) does not recompute or invalidate `nutrition_targets`.** Changing diet type, carb approach, or sugar preference is silently ignored by the calorie target. Same for `PATCH /me/onboarding` and `PATCH /me/profile` even when `weight_kg`, `height_cm`, `age`, `weekly_training_days`, or `primary_goal` change.

This is a combination of the two patterns the prompt asked about: **"two different storage locations holding the same target"** + **"a cached value that's gone stale and isn't being invalidated when the survey is updated"** + **"frontend computing a target locally instead of reading it from backend"**.

## Calculation sites

The formula is implemented **three times**, with **divergent rules**:

### 1. Backend — [armen/backend/app/services/nutrition_service.py](../../armen/backend/app/services/nutrition_service.py)

- `calculate_macro_targets(user_id, db)` (line 18) is the function the spec describes.
- `_compute_tdee(user)` (line 385) — Mifflin-St Jeor BMR × activity multiplier × **multiplicative goal adjustment** (`fat/loss/cut/lean` ×0.85, `muscle/build/bulk/gain/mass` ×1.10, `perform/athlete/sport/endurance` ×1.05, else ×1.0).
- Activity multiplier is parsed loosely from `weekly_training_days` string (`"every day"` → 1.9, `"5"`/`"6"` → 1.725, `"3"`/`"4"` → 1.55, else 1.375).
- **Side-effects**: mutates `user.daily_calorie_target` AND upserts a row in `nutrition_targets`. Both are written.

### 2. Mobile — [armen/mobile/app/(auth)/signup.tsx:119-124](../../armen/mobile/app/(auth)/signup.tsx#L119-L124)

```ts
function calcTDEE(wKg, hCm, age, sex, days, goalAdj) {
  const bonus = sex === 'Male' ? 5 : sex === 'Female' ? -161 : -78;
  const bmr = Math.round(10 * wKg + 6.25 * hCm - 5 * age + bonus);
  const mult = ACTIVITY_MULT[days] ?? 1.55;
  return { bmr, tdee: Math.round(bmr * mult + goalAdj), multiplier: mult, goalAdj };
}
```

- **Additive goal adjustment in kcal** (lines 96–106): Build Muscle +200, Improve Endurance +100, Compete in a Sport +150, fat-loss rates −200/−400/−600.
- Activity multiplier keyed on the *exact UI label* (`'1 to 2 days'`, `'3 to 4 days'`, etc.).
- **The result is sent to `POST /auth/signup` as `daily_calorie_target`** (line 275). Backend writes it directly to `users.daily_calorie_target` without re-validation ([auth.py:168](../../armen/backend/app/routers/auth.py#L168)).

**Numerical example.** A 75 kg, 175 cm, 30 yo male, training 5–6 days/week, "Build Muscle":

| | Mobile | Backend |
|---|---|---|
| BMR | 1699 | 1698.75 |
| × activity | × 1.725 = 2930 | × 1.725 = 2930 |
| Goal adj | + 200 | × 1.10 = 3223 |
| **TDEE** | **3130 kcal** | **3223 kcal** |

The user sees 3130 kcal during signup. The first time anything calls `/nutrition/today` or `/nutrition/targets`, the backend silently overwrites the User row with 3223 kcal. The Nutrition tab shows 3223. Different number, no notification.

### 3. Backend (vestigial fallback) — [armen/backend/app/routers/home.py:48-64](../../armen/backend/app/routers/home.py#L48-L64)

`_compute_macro_targets(calorie_target, primary_goal)` does a hardcoded percentage split (P/C/F by goal). Only used as a fallback when `nutrition_targets` row doesn't exist yet, but it's a third copy of similar logic and deserves removal.

## Storage sites

Two separate columns hold the same value:

| Location | Set by |
|---|---|
| `users.daily_calorie_target` ([model](../../armen/backend/app/models/user.py#L60)) | `POST /auth/signup` (mobile-computed value), `PATCH /me/onboarding`, `calculate_macro_targets` (overwrites) |
| `nutrition_targets.daily_calorie_target` ([model](../../armen/backend/app/models/nutrition_targets.py#L22)) | `calculate_macro_targets` only |

There is no DB constraint or trigger keeping them in sync.

## Read sites

Every place the calorie target is read, with the exact field path:

### Backend → mobile

| Endpoint | Reads from | File |
|---|---|---|
| `GET /home/dashboard` → `dashboard.calorie_target` | `current_user.daily_calorie_target` | [home.py:290](../../armen/backend/app/routers/home.py#L290), [home.py:665](../../armen/backend/app/routers/home.py#L665) |
| `GET /home/dashboard` → `dashboard.macro_targets` | `nutrition_targets` (via `get_cached_targets`) with `_compute_macro_targets` fallback | [home.py:295-304](../../armen/backend/app/routers/home.py#L295-L304) |
| `GET /nutrition/today` → `targets.daily_calorie_target` | `nutrition_targets` (via `get_cached_targets`) — returns `null` if no row | [nutrition.py:140](../../armen/backend/app/routers/nutrition.py#L140) |
| `GET /nutrition/targets` | `nutrition_targets`; if null, calls `calculate_macro_targets` (which mutates User row + creates row) | [nutrition.py:204-208](../../armen/backend/app/routers/nutrition.py#L204-L208) |
| `POST /nutrition/targets/recalculate` | always recomputes via `calculate_macro_targets` | [nutrition.py:254-261](../../armen/backend/app/routers/nutrition.py#L254-L261) |
| `GET /nutrition/weekly-summary` | `current_user.daily_calorie_target or 2000` | [nutrition.py:484](../../armen/backend/app/routers/nutrition.py#L484) |
| `GET /nutrition/weekly-calories` | `nutrition_targets.daily_calorie_target` → `current_user.daily_calorie_target` → 2000 | [nutrition.py:528-531](../../armen/backend/app/routers/nutrition.py#L528-L531) |
| `POST /nutrition/meal-plan/regenerate` (AI prompt) | `get_cached_targets` → `calculate_macro_targets` (creates if missing) → `user.daily_calorie_target` fallback | [meal_plan.py:124](../../armen/backend/app/routers/meal_plan.py#L124), [meal_plan.py:800-803](../../armen/backend/app/routers/meal_plan.py#L800-L803) |
| `POST /nutrition/assistant` (AI prompt context) | same as meal-plan/regenerate | [meal_plan.py:858](../../armen/backend/app/routers/meal_plan.py#L858) |
| `POST /posts/...` (Daily Insight Card stat capture) | `nutrition_targets.daily_calorie_target` → `current_user.daily_calorie_target` | [posts.py:475-487](../../armen/backend/app/routers/posts.py#L475-L487) |
| `readiness_service` (recovery context) | `user.daily_calorie_target` | [readiness_service.py:347](../../armen/backend/app/services/readiness_service.py#L347) |

### Mobile screens

| Screen | Field | File |
|---|---|---|
| Home — Nutrition snapshot card | `dashboard.calorie_target` (from `users.daily_calorie_target`) | [(tabs)/index.tsx:662](../../armen/mobile/app/(tabs)/index.tsx#L662) |
| Nutrition tab — calorie circle | `targets.daily_calorie_target` (from `nutrition_targets`); `?? 2000` | [(tabs)/nutrition.tsx:967](../../armen/mobile/app/(tabs)/nutrition.tsx#L967) |
| Nutrition tab — weekly bar chart targets | per-day `target` from `/nutrition/weekly-calories` | [(tabs)/nutrition.tsx:373](../../armen/mobile/app/(tabs)/nutrition.tsx#L373) |
| Daily check-in pre-log card | `dashboard.calorie_target` (passed through from Home) | [checkin.tsx:98](../../armen/mobile/app/checkin.tsx#L98) |

**The smoking gun**: the Home card and the Nutrition card read from different DB columns. Whenever those two columns disagree (which they will — see below), the user sees two different numbers for the same metric.

## How the inconsistency presents in practice

### Scenario A — fresh signup, before opening Nutrition tab

1. User completes signup. Mobile computes TDEE = 3130 (additive goal adj). Sends to backend.
2. Backend stores `users.daily_calorie_target = 3130`. `nutrition_targets` row does not exist yet.
3. User lands on Home. `GET /home/dashboard` returns `calorie_target = 3130`. **Home card: 3130 ✓**
4. User opens Nutrition tab. `GET /nutrition/today` returns `targets = null` (no `nutrition_targets` row). The mobile then reads `?? 2000` and shows 2000. **Nutrition card: 2000 ✗** (concretely wrong; mismatch with Home).
5. In parallel, mobile calls `getNutritionTargets()` (`/nutrition/targets`). That endpoint creates the row by calling `calculate_macro_targets`, which **also** mutates the User row to 3223 (backend formula). Now `users.daily_calorie_target = 3223` and `nutrition_targets.daily_calorie_target = 3223`. Mobile updates `targets` state. **Nutrition card: 3223** — but Home is still showing the cached 3130 from the earlier dashboard fetch.
6. User pulls to refresh on Home. Now Home returns 3223. They went from 3130 → 3223 with no explanation.

### Scenario B — user edits the survey to change goal/diet

1. Existing user. `users.daily_calorie_target` and `nutrition_targets.daily_calorie_target` both equal 3223 (synced earlier).
2. User edits the nutrition survey. Changes `diet_type` to "Vegan", `carb_approach` to "Low carb", `sugar_preference` to "Avoid".
3. Mobile sends `PATCH /nutrition/profile` (which is `meal_plan.py:upsert_nutrition_profile`). It saves the profile fields and **does not recompute targets**.
4. The Nutrition tab still shows 3223 cal / old protein / old carb / old fat split. The user expected the new diet to influence at least the protein and macro split.
5. The meal plan generator on next regenerate uses `get_cached_targets` which returns the *stale* row. The diet change is silently ignored by the calorie/macro math even though the AI prompt does see the updated profile fields.

### Scenario C — user changes goal via `PATCH /me/onboarding`

1. User changes `primary_goal` from "General Fitness" to "Lose Weight" via settings.
2. `update_onboarding` writes the new goal but does **not** recompute targets.
3. `users.daily_calorie_target` stays at maintenance (2930). `nutrition_targets` row stays at maintenance.
4. Home and Nutrition both still show maintenance, but the survey screen and assistant prompt show the new goal. Inconsistent state.

## Proposed single source of truth

A single source: **`nutrition_targets`**, populated by exactly one function: **`calculate_macro_targets`**, in [armen/backend/app/services/nutrition_service.py](../../armen/backend/app/services/nutrition_service.py).

The `users.daily_calorie_target` column becomes a **convenience denormalisation** that is **only ever written by `calculate_macro_targets`** alongside the `nutrition_targets` row. The `OnboardingUpdate` and `UserCreate` schemas should drop `daily_calorie_target` from their accepted input fields. Onboarding completion triggers `calculate_macro_targets` server-side.

**Trigger points** (everywhere the formula inputs can change):
- After `POST /auth/signup` if all required inputs (weight, height, age, sex, weekly_training_days, primary_goal) are present.
- After `PATCH /me/onboarding` whenever any of those fields was in the patch payload, OR when `onboarding_complete` flips to true.
- After `PATCH /nutrition/profile` whenever `diet_type`, `carb_approach`, `sugar_preference`, or `strictness_level` was in the payload (these affect protein/carb/fat splits and sugar/fibre/iron/calcium targets).
- After `PATCH /me/profile` (or wherever weight gets saved — see audit item 1.3 area) whenever `weight_kg` changes.

**Reads**:
- All endpoints that currently read from `users.daily_calorie_target` directly should be migrated to use `get_cached_targets`. If `get_cached_targets` returns null, call `calculate_macro_targets` once to populate.
- Drop the `_compute_macro_targets` fallback in `home.py` — once `nutrition_targets` is consistently populated, it is dead code.
- The mobile signup screen continues to *display* a preview during the multi-step flow (good UX — we want the user to see roughly what they're committing to), but **stops sending `daily_calorie_target` to the backend**. The preview becomes informational only. Backend computes the persisted value from the same inputs.

**Cache invalidation**: not really a cache — `nutrition_targets` is the persistent store. "Invalidation" simply means: any endpoint that mutates a formula input must end its handler by calling `calculate_macro_targets`. There is no separate cache layer to invalidate.

## Files that need to change (fix phase, awaiting approval)

### Backend

- [armen/backend/app/routers/auth.py](../../armen/backend/app/routers/auth.py) — `signup` and `update_onboarding`: stop accepting `daily_calorie_target` from the client; call `calculate_macro_targets` if all inputs present.
- [armen/backend/app/schemas/user.py](../../armen/backend/app/schemas/user.py) — drop `daily_calorie_target` from `UserCreate` and `OnboardingUpdate` input schemas. Keep it on the *output* schemas (`UserOut`/`UserOutInternal`) since reads are fine.
- [armen/backend/app/routers/meal_plan.py](../../armen/backend/app/routers/meal_plan.py) — `upsert_nutrition_profile`: at the end, call `calculate_macro_targets` if any formula-affecting field was in the payload (`diet_type`, `carb_approach`, `sugar_preference`, `strictness_level`).
- [armen/backend/app/routers/nutrition.py](../../armen/backend/app/routers/nutrition.py) — `weekly-summary` (line 484) and `weekly-calories` (lines 528–531): switch to `get_cached_targets`, lazy-create with `calculate_macro_targets` if missing. Stop reading from `current_user.daily_calorie_target`.
- [armen/backend/app/routers/home.py](../../armen/backend/app/routers/home.py) — read `daily_calorie_target` via `get_cached_targets` (with lazy create) instead of `current_user.daily_calorie_target`. Remove `_compute_macro_targets` once the fallback path is gone.
- [armen/backend/app/routers/posts.py](../../armen/backend/app/routers/posts.py) — same migration; drop the User-row fallback.
- [armen/backend/app/services/readiness_service.py](../../armen/backend/app/services/readiness_service.py) — same.
- [armen/backend/app/services/nutrition_service.py](../../armen/backend/app/services/nutrition_service.py) — small docstring update to mark itself as the only writer; otherwise unchanged.
- (Optional follow-up, not part of this fix) Add a DB trigger or a check in tests asserting the User column always equals the `nutrition_targets` column. Belt-and-braces.

### Mobile

- [armen/mobile/app/(auth)/signup.tsx](../../armen/mobile/app/(auth)/signup.tsx) — keep `calcTDEE` as a *display preview* during the calorie step. Stop sending `daily_calorie_target` to `POST /auth/signup`. After signup completes, call `getNutritionTargets()` once to populate, then surface the *backend-computed* value back to the user before they leave the flow (or accept that the value they see may differ on first Home load — but UX-wise we should match the displayed preview to the backend formula).
  - **Cleanest fix**: replace the additive `GOAL_ADJ` constants with multipliers identical to the backend (`fat/loss/cut/lean` ×0.85, `muscle/build/bulk/gain/mass` ×1.10, `perform/athlete/sport/endurance` ×1.05, else ×1.0). Then the preview matches the persisted value byte-for-byte and there's no surprise jump.
- [armen/mobile/app/nutrition-survey.tsx](../../armen/mobile/app/nutrition-survey.tsx) — after `PATCH /nutrition/profile` succeeds, refetch `/nutrition/targets` (or call `/nutrition/targets/recalculate` then refetch) so the in-memory state reflects the new targets. The backend is doing the recompute server-side; the mobile just needs to pull fresh data.
- [armen/mobile/app/(tabs)/nutrition.tsx](../../armen/mobile/app/(tabs)/nutrition.tsx) — no semantic change needed (already reads from `nutrition_targets`). Possibly remove the `?? 2000` fallback in favour of a loading state, since after the backend fix `targets` will always be populated for any user past onboarding.
- [armen/mobile/app/(tabs)/index.tsx](../../armen/mobile/app/(tabs)/index.tsx) — no change needed (already reads `dashboard.calorie_target`, which after the backend fix becomes the same value as the Nutrition tab reads).

### Migration / data fix

- One-shot migration script (`armen/backend/scripts/`) that, for every user with `onboarding_complete = true`, runs `calculate_macro_targets` to bring both columns into sync with the canonical formula. Existing users will see a one-time recalculation. We should expect a small number of users to see their calorie target shift; that's the explicit intent (correct value over historical mobile-computed value).

## Audit item interactions

- **Audit 1.3 (survey wipe)**: already fixed in the survey hydration code at [nutrition-survey.tsx:339-355](../../armen/mobile/app/nutrition-survey.tsx#L339-L355) — survey loads from `getNutritionProfile()` and merges, doesn't reset to `DEFAULT_SURVEY`. The proposed fix here does not regress it. **Flag only — not expanding scope**.
- **Audit 1.4 (timezone)**: orthogonal. The targets calc doesn't depend on day boundaries. **Flag only — not expanding scope**.

## Out of scope for this fix (deliberate)

- Re-architecting `nutrition_targets` to be the only column (drop the User-row column entirely). That's a bigger change touching many callers; doing the smaller "always go through `calculate_macro_targets`" fix achieves consistency without a schema migration.
- Apple HealthKit-driven recalculation (e.g., recompute when imported weight from HealthKit lands). The audit doesn't call for this and it would expand scope.
- Changing the formula itself. The Mifflin-St Jeor + multiplicative goal adjustment in `_compute_tdee` is what we standardise on.

---

## Status

Approved on 2026-04-29. Shipped across four commits:

1. `bd7e1f1` — analysis doc (this file)
2. `17d5f29` — `fix(backend): single source of truth for calorie target`
3. `ce3041f` — `fix(mobile): align calorie target with backend single source of truth`
4. (this commit) — backfill migration script at [armen/backend/scripts/recalc_macro_targets.py](../../armen/backend/scripts/recalc_macro_targets.py)

## Verification plan

After deploying these commits, run through the scenarios below on a real device against the dev backend.

### 1. Fresh signup → Nutrition tab consistency

1. Create a new user. Complete onboarding with a known input set (e.g., 30y / 75 kg / 175 cm / Male / 5–6 days / Build Muscle).
2. On the calorie step (S9), note the displayed kcal. The breakdown card should show "Goal adjustment × 1.10 (+293 kcal)" or similar — multiplicative, matching the backend formula.
3. Land on Home. The Nutrition snapshot card should show the same calorie target.
4. Open the Nutrition tab. The big calorie circle should also show the same target.
5. Open the AI Ask ORYX (assistant). The system prompt should include the same target.

**Pass criteria:** identical kcal value across signup preview, Home, Nutrition, and assistant prompt.

### 2. Survey edit propagates everywhere

1. Same user. Change `primary_goal` from "Build Muscle" to "Lose Fat" via Settings → onboarding edit (or whichever flow saves to `PATCH /me/onboarding`).
2. Open Nutrition tab — calorie circle should drop (~16% lower vs maintenance).
3. Open Home — same number.
4. Trigger meal-plan regenerate — the AI prompt's "Total calories" line should match.

**Pass criteria:** changing any TDEE input (`weight_kg`, `height_cm`, `age`, `biological_sex`, `weekly_training_days`, `primary_goal`) ripples to all read sites.

3. Edit the nutrition survey: change `diet_type` to "Vegan", `carb_approach` to "Low carb". Save. Open Nutrition tab — protein should increase (vegan ×1.10), carbs should drop, fat should rise. The calorie target should be unchanged (those fields don't affect TDEE) but macro split should differ.

### 3. Persistence — not cache-only

1. Recompute targets. Wait. Recompute again with no input change.
2. The displayed calorie target should be identical both times.
3. Restart the backend process. `nutrition_targets` row persists in PostgreSQL, so values remain.

### 4. Backfill migration

1. Run `python scripts/recalc_macro_targets.py` (dry run). Output lists every user whose stored target differs from the canonical formula.
2. Spot-check a few — manually compute expected TDEE for known users, verify the proposed new value matches.
3. Run `python scripts/recalc_macro_targets.py --apply` to commit.
4. Re-run the dry run — should report `0 would change`.

**Pass criteria:** idempotent. Second dry run reports zero diffs.

### Edge cases worth manual testing

- Mid-onboarding user (some inputs missing) — should not crash. `_has_full_macro_inputs` returns False, no recalc fires, the User row stays at its default.
- User with `weight_kg=null` who logs a weight — first weight log triggers a recalc once all other inputs are present.
- User who has never opened Nutrition tab — first read of `/home/dashboard` lazily populates `nutrition_targets`.
