# ORYX Nutrition Audit — 2026-04-20

Scope: `armen/mobile/app/(tabs)/nutrition.tsx`, `armen/mobile/app/nutrition-survey.tsx`, `armen/mobile/components/FoodSearchModal.tsx`, `armen/backend/app/routers/nutrition.py`, `armen/backend/app/routers/meal_plan.py`, `armen/backend/app/routers/food.py`, `armen/backend/app/services/nutrition_service.py`, `armen/backend/app/services/claude_service.py` (scan section), `armen/backend/app/services/food_search_service.py`.

Honest read after inspection. Unverified runtime behavior is flagged "needs manual testing."

---

## Nutrition Screen Header

**Files:** `armen/mobile/app/(tabs)/nutrition.tsx` (lines 964-990)
**Implementation status:** complete
**Data:**
- `NUTRITION · <DAY>` ticker: derived locally from `Date`
- Survey settings icon: only shown when `surveyComplete`; deep-links to `/nutrition-survey` (which re-PATCHes the profile on completion — good for editing, but the survey reloads empty defaults; it loads `profileData` only to render the summary card on step 6, it does NOT prefill inputs on steps 1–5). Re-submitting a partially-filled survey will overwrite existing prefs. Real bug.
- Scan food pill: triggers `handleScanPhoto`
**Broken / partial:** Survey edit flow resets all answers.
**Missing from spec:** —
**Light mode:** Uses theme tokens for most header styles — OK.
**Notes:** The "settings-outline" and "scan food" pills are styled consistently.

---

## Unified Calorie + Macro Card

**Files:** `nutrition.tsx` lines 251-357, 1017-1022 (macro circles row)
**Implementation status:** complete
**Data:**
- Calorie ring: real (`totalCalories` from `/nutrition/today` summary; `calorieTarget` from `/nutrition/targets`)
- Macro circles (Protein, Carbs, Fat): real (summary + targets)
- Count-up animation wired via `useCountUp`
- Fallback targets when no targets row exists: hardcoded `2000 / 125 / 225 / 56` (line 932-935). This is a safety net, but if the endpoint returns at all the real Mifflin-St Jeor numbers are used.
**Broken / partial:** "isOver/diff left" is fine. Spec says "3 macro circles BELOW" but they currently live inside a swipeable card labeled "Today's Nutrition," not under the big ring. Layout diverges from spec phrasing but semantically equivalent.
**Missing from spec:** —
**Light mode:** Card backgroundColor is hardcoded `T.glass.card` via theme token + a hardcoded overlay `'rgba(255,255,255,0.06)'` for the ring track (line 302). Track color is white-based — on a light theme that will be invisible. **Needs work.**
**Endpoints called:** `GET /nutrition/today` (success), `GET /nutrition/targets` (success)
**Notes:** Backend target formula is real Mifflin-St Jeor: `_compute_tdee` in `nutrition_service.py:371-409` implements `(10*weight) + (6.25*height) - (5*age) ±161/+5`, applies an activity multiplier by `weekly_training_days` string match, and a goal adjustment. If the user has `weight_kg`, `height_cm`, `age`, real targets are computed; else falls back to `user.daily_calorie_target` or 2000.

---

## Weekly Calorie Trend Chart

**Files:** `nutrition.tsx` lines 359-434 (`WeeklyCalorieTrend`)
**Implementation status:** complete
**Data:**
- Real backend: `GET /nutrition/weekly-calories` (router line 467-507). Aggregates last 7 days of `NutritionLog.calories` grouped by `func.date(logged_at)`, returns `{date, calories_logged, target, day_label}`.
- Target from `NutritionTargets.daily_calorie_target` fallback to `user.daily_calorie_target` fallback 2000.
- Bar colors: threshold logic in `nutrition.tsx:407-410` — over=orange, 90%+=light gray, low=dark gray. Spec says "7 bars colored by target achievement" — matches.
**Broken / partial:** Day labels are single-letter M T W T F S S — not ideal (two T's, two S's; user can't tell). Also this reads from UTC date on the server; edge-case timezone bugs possible for users in non-UTC timezones. **Needs manual testing.**
**Missing from spec:** —
**Light mode:** Card background `'rgba(28,34,46,0.72)'` hardcoded (line 378). Dashed target line `rgba(255,255,255,0.2)` hardcoded. Bar empty-day color `'rgba(255,255,255,0.10)'` hardcoded. **Breaks light mode.**
**Endpoints called:** `GET /nutrition/weekly-calories` → success

---

## Macro + Micronutrient Swipeable Card

**Files:** `nutrition.tsx` lines 1004-1091, `MICRO_DEFS` at 82-128
**Implementation status:** complete
**Data:**
- Page 1 (macros): real, from summary + targets
- Page 2 (micros): real for Fibre, Sugar, Sodium (tracked on `DailyNutritionSummary`); other micros (Vitamin D, Magnesium, Iron, Calcium, Zinc, Omega-3) show TARGET from backend but `consumed` values read from `summary.vitamin_d_consumed_iu` etc. — these fields DO exist in the summary per the read at lines 121-133. Whether any logged food actually populates them depends on scan/search path: scan result includes micros; logNutrition accepts them; manual add UI only has Fibre. So most users will see dashes for Vit D/Mg/Fe/Ca/Zn/Omega-3.
- "Most at-risk" micro selection: computed client-side as lowest ratio among micros 3..8 (line 1028-1040). Works.
**Broken / partial:** Spec says card swipes from macros to "Fibre, Sugar, Sodium, most at-risk nutrient" — implementation instead shows a long micro list with "Show all / Show less." Close to spec, not a bug.
**Missing from spec:** —
**Light mode:** Card bg `'rgba(28,34,46,0.72)'` hardcoded, swipe dot color `'#555555'` / `'#ffffff'` hardcoded. **Needs work.**

---

## Scan Food Photo (OpenAI vision)

**Files:** `nutrition.tsx` 498-896 (handlers + modal), `armen/backend/app/routers/nutrition.py:23-41`, `armen/backend/app/services/claude_service.py:600-687`
**Implementation status:** complete
**Data:**
- Real OpenAI vision call: `gpt-4o-mini` with `image_url` content block (not Claude, despite docstring saying "Claude Haiku vision" — the file is literally named `claude_service.py` but the function uses `_openai_client.chat.completions.create`). Confusing naming, but actually fires OpenAI.
- Returns full micros + `confidence` → `low_confidence` boolean
- Low-confidence warning is rendered (nutrition.tsx:1912-1919)
- User can edit before confirming, logs as `source: 'scan'`
- Image permissions requested via ImagePicker on both camera & library paths
**Broken / partial:**
- `detail: "low"` on image_url — cheap but may hurt accuracy. Tradeoff.
- `_openai_client` is created at module level in `claude_service.py` — if `OPENAI_API_KEY` is missing, scan will error at call time rather than returning a graceful 503 (contrast with assistant which checks `settings.OPENAI_API_KEY` explicitly).
- JSON parse failure → returns zeros with `confidence: "low"`. Good fallback.
- The "Enter Manually Instead" fallback button opens `showAddModal` but `showAddModal` is a manual-form modal while the spec-intent seems to be the food-search modal — usability quirk, not broken.
**Missing from spec:** —
**Light mode:** Modal uses `t.bg.elevated` — likely OK. Warning box uses theme tokens.
**Endpoints called:** `POST /nutrition/scan` → success/error
**Notes:** Logs include base64 length and response preview — useful for debugging. No rate limit on scan endpoint. No size cap checked server-side.

---

## Ask ORYX Nutrition Assistant

**Files:** `nutrition.tsx` 468-474, 742-772, 1112-1174; `meal_plan.py:717-970`
**Implementation status:** complete
**Data:**
- Real OpenAI `gpt-4o-mini` call
- Context: last 5 messages (`conversation_history[-5:]`), full profile, macro targets, today's logs (meals_logged names + calorie/macro totals), today's meal plan summary, yesterday's training load, computed readiness
- 20 msg/day rate limit **enforced on the server** via in-memory dict `_assistant_rate` (meal_plan.py:26, 759-765). **WARNING**: dict is in-process only — resets on server restart, does not scale across workers. Also never clears old day keys (memory leak over time, tiny).
- Frontend does NOT enforce or display the 20/day limit anywhere. User just gets a canned response when they hit it. No counter visible.
- Meal modification detection: real. `MEAL_MODIFICATION: {...}` block parsed with regex at `meal_plan.py:894-898`. On detection, meal plan updated server-side, client refetches.
**Broken / partial:**
- In-memory rate limiter is fragile for production.
- `chatMessages.slice(-9)` on the client (line 747, 754, 765) — keeps last 9 messages on screen, but sends last 5 via `slice(0, -1)` + backend `[-5:]`. OK.
- Rate-limit response is `200 OK` with a plain message — client treats it as a normal reply. No visual indicator "you've hit the daily limit."
- No token-count guard on the prompt; long conversation histories could blow `max_tokens=300`.
**Missing from spec:**
- Spec says "last 5 messages + profile + today's meals + meal plan + readiness" — all present.
- Spec says "Detects meal modification intent" — present.
- Frontend-visible remaining-messages counter missing.
**Light mode:** Chat bubbles use hardcoded `rgba(255,255,255,0.10)` (user), `rgba(28,34,46,0.72)` (assistant), `'#111'` input background, `#fff` text on bubbles. **Breaks light mode.**
**Endpoints called:** `POST /nutrition/assistant` → success/429-style-200/502

---

## Water Tracking

**Files:** `nutrition.tsx` 480-491, 898-922, 1184-1314 (card + drops + +/- + ml mode); `nutrition.py:216-400`; formula `nutrition_service.py:431-470`
**Implementation status:** complete
**Data:**
- Target computed from real formula: `weight_kg × 35` + activity (0/350/500/700) + goal (0/200/300/400) + climate (+300 for hot regions by country-name match). Rounded to nearest 100ml. Spec-aligned.
- Container size: user-settable, default 250ml
- Override: stored per-user in `nutrition_profiles.water_target_override_ml`
- Drop icons / glasses mode / ml mode all working; server PATCHes upsert the row
- "Recommended: X.XL based on your profile" shown only when override differs from recommended by >50ml
**Broken / partial:**
- Drop count is clamped to 4–10 (nutrition.tsx:938). For targets where `target/container` exceeds 10 glasses, the ring visually saturates at 10. Not wrong, but you can't visually complete a 3L target with 250ml glasses.
- Custom container size (100-1000ml per spec): UI only offers pills `200/250/330/400/500`. Spec says 100–1000ml range. **Missing 100ml, 600-1000ml sizes.**
- `settingsTargetInput` parseInt without bounds check — user could enter negative or 100000 with no validation.
**Missing from spec:** Full 100-1000ml container flexibility.
**Light mode:** Settings sheet bg `'rgba(28,34,46,0.72)'`, `#252525`, `#333`, `#111` hardcoded all over (lines 1264, 1296, 1332, 1387, 1396). **Breaks light mode.**
**Endpoints called:** `GET /nutrition/water/today`, `PATCH /nutrition/water/today`, `PATCH /nutrition/water/settings` — all wired.

---

## Today's Meals (food diary)

**Files:** `nutrition.tsx` 1422-1483, modal 1770-1871
**Implementation status:** complete
**Data:**
- Real backend: `GET /nutrition/today`, `POST /nutrition/log`, `DELETE /nutrition/log/{id}`
- Delete **is** server-side: `handleDelete` at line 624 calls `deleteNutritionLog` (DELETE /nutrition/log/{id}) then removes from local state. Summary re-fetched. **Works correctly.**
- Manual log form: name + 4 macros + optional fibre + notes
- Each entry shows chips for kcal/P/C/F and a scan icon if `source === 'scan'`
**Broken / partial:**
- Manual form has no micronutrients beyond fibre (sugar, sodium, vitamins hidden). Per spec that's probably fine — most micros come from scan/search.
- No edit capability, only delete.
**Missing from spec:** —
**Light mode:** Macro chip border colors hardcoded (`'rgba(255,184,0,0.4)'`, `'rgba(255,107,53,0.4)'`) and fixed hex color text `'#888888'`, `'#FF6B35'`. Works in both themes but saturated orange/yellow on white might look odd.

---

## Today's Meal Plan

**Files:** `nutrition.tsx` 459-475, 539-576, 644-717, 1485-1733; `meal_plan.py:216-528`
**Implementation status:** complete
**Data:**
- `GET /meal-plan/today` — returns cached plan for today if exists, else generates via OpenAI and saves. **Daily caching real.** Survey must be complete (400 otherwise).
- Prompt construction at `_generate_meal_plan` includes profile + macro targets + "training load" + readiness + ACWR (per spec) + day-of-week cheat day logic. Returns JSON `{meals, grocery_items, nutrition_note, is_cheat_day, total_*}`.
- Compact list rows with time / name / kcal; tap expands to ingredients + prep note + Log/Bookmark buttons
- "Current meal" dot colored green if within ±30 minutes of meal time — nice touch
- Regenerate button: calls `POST /meal-plan/regenerate`. **The 1/hour rate limit is NOT enforced anywhere.** Backend has the 3/day limit **commented out** (meal_plan.py:557-562 — "Regeneration limit disabled for development"). Frontend doesn't rate-limit either. **Launch blocker per spec (spec says 1/hour).**
- Log This Meal: real, inserts into diary
- Grocery list: collapsible, checkbox state is client-local only (`groceryChecked` state, not persisted). Refreshes lose state.
- Saved meals: `GET /meals/saved`, `POST /meals/save`, `DELETE /meals/saved/{id}` — all wired
**Broken / partial:**
- Regenerate rate limit: not enforced (see above).
- Grocery check state: local only (expected for v1, but annoying).
- Time parsing assumes `"H:MM AM/PM"` format; any other format silently produces gray dot.
**Missing from spec:** The "Regenerate link (1/hour)" rate limit.
**Light mode:** Meal plan card `t.glass.card` + theme tokens — looks OK. Dot colors (`'#27ae60'`, `'#444'`, `'#555'`, `'#333'`) hardcoded. Grocery check `theme.status.success` is themed — good.
**Endpoints called:** `GET /nutrition/profile`, `GET /meal-plan/today`, `POST /meal-plan/regenerate`, `POST /meals/save`, `GET /meals/saved`, `DELETE /meals/saved/{id}`

---

## My Nutrition Profile Card (summary)

**Files:** there is **no persistent collapsed "My Nutrition Profile card"** on the nutrition tab — only a summary rendered as step 6 of the survey (`nutrition-survey.tsx:850-918`). The nutrition tab's `settings-outline` icon is the only entry point for editing.
**Implementation status:** **partial / missing from tab**
**Data:** —
**Broken / partial:** Spec calls for a collapsed profile card on the Nutrition tab with an Edit button. Not implemented.
**Missing from spec:** The profile card itself.
**Light mode:** N/A
**Notes:** Could be retrofitted trivially since `GET /nutrition/profile` already returns everything.

---

## Weekly Summary Card

**Files:** `nutrition.tsx` 1735-1765; backend `nutrition.py` (the `/nutrition/weekly-summary` handler around lines 395-464)
**Implementation status:** complete
**Data:**
- Real backend: avg daily calories, avg daily protein, days calorie target hit (±10%), days protein target hit (±10%), last week comparison
**Broken / partial:** "Days on target" uses `abs(cal - target)/target <= 0.10` — a day with 0 calories logged is excluded (`cal > 0` guard). Days where user forgot to log count against them. Fine.
**Missing from spec:** —
**Light mode:** Cell borders use theme tokens — OK.
**Endpoints called:** `GET /nutrition/weekly-summary`

---

## Nutrition Survey (6 screens)

**Files:** `nutrition-survey.tsx`
**Implementation status:** complete
**Data:**
- 6 steps covering the spec: Food prefs + diet, Restrictions+goal+strictness+cheat, Sugar+carbs+IF, Meals/breakfast/timing/pre/post workout/prep, Cooking skill+time+budget+kitchen+region (full country dropdown 118 countries with flags), Summary
- PATCHes `/nutrition/profile` with `nutrition_survey_complete: true`
- **Smart filtering on Vegan does work** (`DIET_EXCLUDED` map + `getFilteredCategories`, lines 70-97, 451-452): selecting Vegan removes all animal proteins + dairy + Honey/Mayo from the chip grid. Verified by code inspection.
- Amber `dietChangeNotice` if previously selected foods were removed.
- Halal / Kosher note rendered contextually (469-472).
**Broken / partial:**
- **Edit flow is broken**: on re-entry, state resets to `DEFAULT_SURVEY`. `profileData` is fetched (line 331) but only consumed in step 6 summary. Editing a single field and submitting will PATCH empty values for every other field, wiping prior answers. **Launch blocker.**
- Intermittent fasting "Custom" expects HH:MM via keyboardType `numbers-and-punctuation` — no validation.
- Meal times TextInput — no validation, free-form.
- Skip button at top skips step without filling — allows submitting empty profile (then "No preferences saved yet").
**Missing from spec:** —
**Light mode:** Uses `T` theme tokens directly (imported global theme object) — `backgroundColor: t.bg.elevated`, `t.accent`, etc. One styles() factory takes theme. **Should work in light mode but** the fixed `T.text.muted` / `T.accentInk` imported directly at top of file (line 21, 293, 631, 825, 826) are drawn from the *initial static theme* — changes to theme at runtime won't apply to any component that uses `T.*` rather than `t.*`. Mixed usage throughout. **Needs manual testing in light mode.**
**Endpoints called:** `GET /nutrition/profile`, `PATCH /nutrition/profile`

---

## FoodSearchModal (Log Meal button)

**Files:** `armen/mobile/components/FoodSearchModal.tsx`
**Implementation status:** complete
**Data:**
- Search → `GET /nutrition/search` → backend queries **Open Food Facts** + **USDA FoodData Central** (`food_search_service.py:255-311`). Real integrations.
- Barcode → `GET /nutrition/barcode/{barcode}` → Open Food Facts `api/v0/product/{barcode}.json`, falls back to USDA branded foods UPC search. Real.
- Recent/frequent foods: `GET /nutrition/recent`, `/nutrition/frequent` — wired.
- Custom food creation: `POST /nutrition/foods/custom` — wired.
- Barcode scanner uses `expo-camera` `CameraView` with `barcodeScannerSettings: ['ean13','upc_a','upc_e','ean8']`.
**Broken / partial:** Dev-only test barcode harness — benign.
**Missing from spec:** —
**Light mode:** Theme tokens — assumed OK, **needs manual testing.**
**Notes:** Not explicitly called out in spec section but "Log Meal" flow depends on it. Solid.

---

## Data pipeline: backend sanity

- Scan → logs to `NutritionLog` with `source='scan'`, updates `DailyNutritionSummary` via `update_daily_summary` + invalidates readiness cache. Good.
- Mifflin-St Jeor: real, gender-aware, falls back to average for non-binary/missing sex.
- Macro target formula at `nutrition_service.py:67-69`: `protein = weight × protein_per_kg` where `protein_per_kg` varies by goal; fat then carbs remainder. Real, not hardcoded.
- Water formula: real per spec.
- Fibre: `calorie_target × 14 / 1000` floor 25g, or 38g for males. Real.
- Sugar max: varies by sugar_preference pref string match. Real.
- Sodium max, vitamin D, magnesium, iron, calcium, zinc, omega-3 targets: **needs verification** — saw `_compute_water_target` but micros 1..9 targets were not confirmed in the 80-line slice. They may be hardcoded per goal. **Needs manual file read.**

---

## Light mode audit (hex / rgba scan)

`nutrition.tsx` has **64 hardcoded color literals** (`#RRGGBB` or `rgba()`) mostly for:
- `'rgba(28,34,46,0.72)'` — used 8+ times as card bg; locks the screen to a dark palette
- `'rgba(255,255,255,0.06)'`, `'rgba(255,255,255,0.10)'`, `'rgba(255,255,255,0.20)'` — overlay dividers/tracks; white on dark assumption
- `'#555'`, `'#444'`, `'#333'`, `'#252525'`, `'#111'`, `'#888888'` — bar colors, input bg, meal dots, macro labels
- `'#27ae60'`, `'#e67e22'`, `'#c0392b'`, `'#FF6B35'`, `'#e0e0e0'` — signal colors (acceptable, but saturated)

**Verdict:** Nutrition tab is **dark-mode-first and will look broken in light mode.** Key offenders: every glass card, the ring track, the chart dashed line, chat bubbles, and water settings sheet.

`nutrition-survey.tsx` has **0 raw hex literals** — uses theme tokens throughout. BUT it imports the static `theme as T` singleton and mixes it with the `useTheme()`-provided `t` in styles, so live theme switches may not fully propagate. **Needs manual testing.**

---

## Launch blockers (June 23)

1. **Nutrition Survey edit flow wipes prefs.** Re-opening the survey from the settings icon resets to `DEFAULT_SURVEY` and submitting any change PATCHes empty fields for everything else. Must prefill from `profileData`.
2. **Meal plan regenerate has no rate limit.** Spec says 1/hour; backend has the 3/day limit commented out "for development"; no frontend limiter. Users can spam OpenAI $.
3. **Ask ORYX rate limit is in-memory only.** 20/day limit resets on server restart or load-balances inconsistently across workers. Needs DB persistence.
4. **Missing "My Nutrition Profile" summary card** on the Nutrition tab (only accessible via gear icon to the full survey).
5. **Light mode breaks the Nutrition tab.** Hardcoded dark-mode hex/rgba values throughout mean the screen will be illegible if a user switches themes. Ship with light mode disabled for this tab or convert to theme tokens.
6. **Regenerate/scan have no server-side abuse protection.** Scan endpoint has no rate limit at all — one malicious user can rack up OpenAI bills.

## Launch polish

1. Weekly trend day labels `M T W T F S S` — two Ts and two Ss, user can't read.
2. Timezone for `/nutrition/weekly-calories` — `datetime.utcnow()` based; users outside UTC may see off-by-one days. Needs manual testing.
3. Ask ORYX: no visible "X messages left today" indicator on the frontend.
4. Grocery list check state is client-only; refresh loses checks.
5. Water container pill set (`200/250/330/400/500`) missing the full 100–1000ml range spec calls for.
6. Manual log form: only has macros + fibre; sugar/sodium hidden in UI (OK but worth surfacing via an advanced toggle).
7. Scan modal "Enter Manually Instead" opens the manual macro modal, not the FoodSearchModal — small UX issue.
8. `claude_service.py` houses an OpenAI call for food scanning (docstring says "Claude Haiku vision" — misleading naming).
9. `meals_per_day` number selector offers 2–6; adding 1 or 7+ would be trivial.

## Post-launch (cut from v1.0)

1. Full micronutrient tracking (Vit D, Mg, Fe, Ca, Zn, Omega-3) from manual entry.
2. Edit an existing meal log (currently delete-only).
3. Grocery list persistence (check state).
4. Meal plan deep ingredient swap (AI modifies plan on chat — already partly works, polish needed).
5. Per-meal photo memory for scan history.

## Concerns

1. **Cost exposure:** Food scan + Ask ORYX + meal plan generation + meal plan regeneration all call OpenAI, and only the assistant has any kind of rate limit. A single abusive or buggy client could cost hundreds of dollars of OpenAI quota in an hour.
2. **In-memory rate limiter** (`_assistant_rate: dict`) is a footgun under multiple workers / restart.
3. **Mixed theme usage** in `nutrition-survey.tsx`: static `T` import + dynamic `t` via hook. Will cause subtle bugs when theme switches.
4. **Timezones** throughout are `datetime.utcnow()` server-side; for a user in UTC+10 logging dinner at 8pm local, backend records it as the NEXT DAY. Daily summary rollovers will drift.
5. **Water target override path**: `PATCH /nutrition/water/settings` with `target_ml: null` is intended to reset; code at nutrition.py:349-353 checks `payload.target_ml is not None` then falls to `"target_ml" in payload.model_fields_set` — correct but fragile, would break with Pydantic config changes.
6. `claude_service.py` mislabels its OpenAI vision call as "Claude Haiku vision." Confusing during debugging; will burn future developer time.
7. `handleBackwardCompat` style — regeneration limit removed "for dev" — smells like it never got turned back on. Same pattern likely exists elsewhere in the meal plan flow.
8. No observable test coverage on nutrition service math (Mifflin-St Jeor, water formula, fibre) — a bad edit will silently ship wrong targets.
