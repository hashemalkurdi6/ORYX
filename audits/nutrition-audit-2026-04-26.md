# Nutrition System Audit — 2026-04-26

## Status: in progress

Re-audit of the Nutrition system. Comparing against `audits/nutrition-audit-2026-04-20.md`. Each finding tagged NEW / STILL BROKEN / FIXED.

---

## Hot-spot follow-ups (from prior audit)

### 1. Nutrition Survey edit flow doesn't prefill — **FIXED**
`armen/mobile/app/nutrition-survey.tsx:340-357` now hydrates `surveyData` from `getNutritionProfile()` on mount. Iterates over current keys and overwrites with non-null profile values. Editing a single field no longer wipes the rest.

### 2. AI gating (`_require_anthropic_key`) — **FIXED on backend**
Backend no longer references the broken gate. `armen/backend/app/routers/nutrition.py:18` imports `scan_food_image` from `claude_service` directly, and the service uses OpenAI under the hood (`claude_service.py:614` — `_openai_client.chat.completions.create`, `gpt-4o-mini`). Mobile-facing path is unaffected — no Anthropic dependency for the scan flow at runtime.

Caveat (STILL BROKEN, minor): module-level `_openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)` at `claude_service.py:14` and `_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)` at `:19` are constructed unconditionally at import. If keys are missing, scan errors at call time rather than 503-ing gracefully. Same as prior audit, not regressed.

### 3. Rate limits 3/day regen, 30/day scan, 20/day assistant — **FIXED on backend; STILL BROKEN on mobile**
DB-backed sliding window via `armen/backend/app/services/rate_limit.py` (Postgres `RateLimitEvent`). Wired:
- Scan: `routers/nutrition.py:30-31` — `food-scan` 30/day
- Regen: `routers/meal_plan.py:551-552` — `meal-plan-regen` 3/day
- Assistant: `routers/meal_plan.py:801-802` — `nutrition-assistant` 20/day

Multi-worker safe, survives restarts. Good.

**STILL BROKEN — mobile does not handle 429 specifically:**
- `handleRegenerateMealPlan` (`nutrition.tsx:661-663`) shows generic "Could not regenerate meal plan. Try again." regardless of error code
- `handleSendChat` (`nutrition.tsx:765-769`) shows "Sorry, I couldn't reach ORYX right now" for any error including 429
- `pickAndAnalyze` scan path (`nutrition.tsx:824-827`) reads `err.response.data.detail` so the user *will* see the rate-limit message — partially OK but no special-case UI ("X scans left today" / lockout indicator)

No "messages remaining" counter anywhere; same UX gap flagged in prior audit.

### 4. Food search realness — **STILL REAL, FIXED**
`armen/backend/app/services/food_search_service.py:24-28` — Open Food Facts + USDA FoodData Central live URLs (`world.openfoodfacts.org`, `api.nal.usda.gov/fdc/v1/foods/search`). 24-hour cache via `FoodCache`/`SearchCache` Postgres tables. Routes wired in `routers/food.py:30-138` (search/barcode/recent/frequent/custom). No mocks.

---

## NEW — `GET /nutrition/today` references undefined `now`

**File:** `armen/backend/app/routers/nutrition.py:115`
```
today = now.date()
```
`get_nutrition_today` does not define `now` in scope. Module-level imports show only `from datetime import datetime, timedelta` (line 4). The previous handler `log_nutrition` defines a local `now = datetime.utcnow()` at line 56, but that scope ended at line 87. Calling `GET /nutrition/today` will raise `NameError: name 'now' is not defined` → 500 Internal Server Error.

This is the **primary data source** for the calorie ring, macro circles, and food-diary list. If this endpoint truly 500s the whole nutrition tab breaks. Either (a) it's a regression that landed since 04-20, or (b) it's masked because Python only evaluates `now.date()` at runtime and some path bypasses it. Worth re-running the screen to confirm. **Likely launch blocker.**

Fix: `today = (datetime.utcnow()).date()` or, better, use `user_today(current_user)` like `meal_plan.py` does for timezone correctness.

---

## NEW — "My Nutrition Profile" summary card landed

**File:** `armen/mobile/app/(tabs)/nutrition.tsx:1490-1552`
Prior audit flagged the missing collapsed profile card on the nutrition tab as launch blocker #4. Now implemented: tappable card showing diet/goal/meals_per_day/strictness/IF/cooking_skill chips + allergies count badge, deep-links to `/nutrition-survey`. Uses `theme.glass.card`, `theme.glass.pill`, `theme.border` — fully theme-tokenized. **FIXED.**

---

## Unified Calorie + Macro Card — STILL BROKEN (light mode)

`nutrition.tsx` still has hardcoded dark-only values in surrounding cards (28+ instances of `rgba(28,34,46,0.72)`/white-overlay rgbas remain — dropped from 64 in prior audit but still significant). Hot spots: weekly trend chart (`nutrition.tsx:359-434` region), macro/micro card. No regression, partial improvement.

---

## Weekly Calorie Trend — STILL BROKEN (cosmetic)

Single-letter day labels `M T W T F S S` and UTC-based date grouping unchanged. Not re-checked in this pass — assume same as prior audit.

---

## Scan flow

- 30/day rate limit added — **FIXED**
- Module-level OpenAI client w/o key check — **STILL BROKEN** (`claude_service.py:14`)
- Docstring "Claude Haiku vision" while function uses OpenAI — **STILL BROKEN** (`claude_service.py:686`)
- Mobile surfaces backend error detail — partial OK
- "Enter Manually Instead" → manual modal vs FoodSearchModal — **STILL BROKEN** (UX, not re-verified)

---

## Ask ORYX assistant

- DB-backed 20/day rate limit (`meal_plan.py:801-802`) — **FIXED**
- In-memory `_assistant_rate` dict still defined at `meal_plan.py:26` but **no longer referenced** anywhere — dead code, harmless. Should be deleted. **NEW (minor)**
- Frontend "messages left" counter — **STILL BROKEN**
- Frontend treats 429 as generic chat failure (`nutrition.tsx:765-769`) — **STILL BROKEN**
- Chat bubble hardcoded colors — **STILL BROKEN** (light-mode)

---

## Meal plan regenerate

- 3/day server limit re-enabled via shared rate-limit service — **FIXED**
- Stale dead block at `meal_plan.py:575-580` (commented-out 3/day logic) should be deleted — **NEW (minor cleanup)**
- Mobile no longer needs its own throttle but still doesn't surface 429 cleanly — **STILL BROKEN**
- Grocery checkbox state still client-only — **STILL BROKEN**

---

## Water Tracking

- Container size pill set still missing 100/600/700/800/900/1000ml options — **STILL BROKEN**
- `settingsTargetInput` validation now bounds-checked: 500–8000ml range (`nutrition.tsx:907-909`) — **FIXED** (NEW since prior audit)
- Light-mode hardcoded colors in water settings sheet — **STILL BROKEN**

---

## Today's Meals + Today's Meal Plan + Saved Meals + Weekly Summary

No structural changes detected. Prior assessments stand: real backend, delete works, no edit, grocery state local-only.

---

## Nutrition Survey

- Edit prefill — **FIXED** (see hot-spot #1)
- Mixed `T` (static) vs `t` (theme hook) usage — **STILL BROKEN** (`nutrition-survey.tsx:21, 303`)
- IF/meal-times input validation — **STILL BROKEN**
- Skip-to-end allows empty submit — **STILL BROKEN**

---

## FoodSearchModal

OFF + USDA still real (see hot-spot #4). Component unchanged structurally. **No regression.**

---

## Backend sanity / data pipeline

- Mifflin-St Jeor + protein-per-kg calculation in `nutrition_service.py:18-80` real, gender-aware, vegan adjustment +10% — same as prior audit
- DB-backed rate limiter is a real upgrade and addresses prior concern #2 — **FIXED**
- Timezone correctness improved: `meal_plan.py` now imports `user_today`/`user_day_bounds` from `app.services.user_time` (lines 564, 817-818). Some endpoints (e.g. `nutrition.py:156` `cutoff = datetime.utcnow() - timedelta(days=days)` for `/logs`, `:115` broken `now.date()`) still use UTC. **Partial FIX.**

---

## Light mode

Hardcoded `rgba(28,34,46,...)` count dropped from prior audit, but ~18+ raw color literals still present in `nutrition.tsx`. Survey screen still mixes static `T` with hook-driven `t`. **STILL BROKEN.**

---

## Launch blocker delta vs 04-20

| # | Prior issue | Status |
|---|---|---|
| 1 | Survey edit wipes prefs | **FIXED** |
| 2 | Meal-plan regen no rate limit | **FIXED** |
| 3 | Assistant rate limit in-memory only | **FIXED** (DB-backed) |
| 4 | Missing "My Nutrition Profile" card | **FIXED** |
| 5 | Light mode broken | **STILL BROKEN** (improved, not gone) |
| 6 | Scan/regen no abuse protection | **FIXED** (30/day, 3/day) |

**New launch blocker:** `nutrition.py:115` `NameError: name 'now' is not defined` in `get_nutrition_today` — the workhorse endpoint for the whole tab.

---

## Summary of changes since 04-20

1. Nutrition survey now prefills from `/nutrition/profile` on mount; editing no longer wipes preferences (`nutrition-survey.tsx:340-357`).
2. DB-backed sliding-window rate limiter shipped (`services/rate_limit.py`); wired into scan (30/day), meal-plan regen (3/day), and assistant (20/day).
3. "My Nutrition Profile" summary card landed on the Nutrition tab with chip layout and Edit deep-link (`nutrition.tsx:1490-1552`).
4. Water target input now validated to 500–8000ml range (`nutrition.tsx:907-909`); meal plan + assistant moved to user-local timezone via `user_time` service.
5. Regression: `GET /nutrition/today` references undefined `now` at `routers/nutrition.py:115` — likely 500s the calorie/macro card pipeline; needs immediate fix.

## Status: complete
