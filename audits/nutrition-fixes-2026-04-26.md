# Nutrition Fixes — 2026-04-26

Working through `nutrition-audit-2026-04-26.md`. Each fix logged inline.

---

## Backend

### 1. `nutrition.py:115` `now` NameError — verified pre-fixed
Replaced earlier with `user_today(current_user)` + `user_day_bounds(current_user)`. Confirmed at `routers/nutrition.py:100-101`.

### 2. `nutrition.py:156` `/logs` UTC cutoff → user-local
`cutoff = datetime.utcnow() - timedelta(days=days)` was UTC-based. Replaced with `user_day_bounds(current_user, user_today(current_user))[0] - timedelta(days=days - 1)` so the N-day window starts at the user's local midnight N-1 days ago.

### 3. `claude_service.py:686` docstring fixed
Changed "using Claude Haiku vision" → "using OpenAI gpt-4o-mini vision" to match implementation.

### 4. Dead `_assistant_rate` dict at `meal_plan.py:26` — deleted
Removed the unused in-memory dict and its comment.

### 5. Stale commented-out regen-limit block at `meal_plan.py:575-580` — deleted
Cleaned up the disabled-for-development comment block. Server-side limit is enforced by `check_rate_limit("meal-plan-regen", 3, 86400)` above.

### 6. New `/nutrition/limits` endpoint
Added `GET /nutrition/limits` returning remaining daily allowances for `food_scan` (30/day), `meal_plan_regen` (3/day), and `assistant` (20/day). Reads from `RateLimitEvent` rows in the same window the rate limiter uses, so it's authoritative.

---

## Mobile

### 7. `services/api.ts` — `getNutritionLimits()` + types
Added `NutritionLimits` / `NutritionLimitBucket` interfaces and a thin client wrapping `GET /nutrition/limits`.

### 8. `nutrition.tsx` — 429 handling
- `handleRegenerateMealPlan`: detects `err.response.status === 429` and shows "Daily limit reached, ... Try again tomorrow."
- `handleSendChat`: 429 produces an in-chat assistant message "Daily limit reached (20 messages/day). Try again tomorrow."
- `pickAndAnalyze` scan: 429 surfaces "Daily scan limit reached (30/day)..." instead of leaking the raw FastAPI detail.
- All three call `refreshLimits()` after success and failure.

### 9. `nutrition.tsx` — messages-remaining counter on Ask ORYX
`limits.assistant.remaining/limit` rendered in the chat header next to the collapse chevron, with a small monospace style.

### 10. `nutrition.tsx` — limits state + auto-fetch
Added `limits` state and `refreshLimits()` callback. Fired from initial `useEffect` and `handleRefresh` (pull-to-refresh) so the counter always reflects current usage.

### 11. `nutrition.tsx` — raw color literals replaced with theme tokens
Replaced all `rgba(28,34,46,0.72)` / `rgba(255,255,255,0.x)` / `rgba(0,0,0,0.5)` / `rgba(39,174,96,...)` literals with `t.glass.card`, `t.glass.border`, `t.glass.shade`, `t.glass.pill`, `t.bg.subtle`, `t.divider`, `t.status.success`, `t.status.warn`, `t.status.danger`, `t.text.*`. Touch sites: progress bar, calorie ring track, weekly trend card + dashed line + bar fallback, today's meals macro chip borders, water progress track, water settings sheet (backdrop + sheet bg + border), Ask ORYX chat input/bubbles, surveyPromptCard, mealPlanHeader, cheatDayBadge, unifiedCard, nutritionSwipeCard, swipeDot(Active), mealModifiedBanner.

### 12. `nutrition.tsx` — water container size pills
Added 700, 800, 900 ml. Final set: `[100, 200, 250, 330, 400, 500, 600, 700, 750, 800, 900, 1000]`.

### 13. `nutrition-survey.tsx` — unify `T` (static) → `useTheme()` (`theme`)
- Replaced module-level `Proxy`-backed `styles` with per-component `useMemo(() => createStyles(theme), [theme])` inside `Pill`, `LargeTile`, and `FoodChip`.
- Replaced 7 inline `T.text.muted/primary/signal.load/accentInk` JSX references with `theme.*`.
- Dropped `theme as T` from the imports.

---

## Not changed (out of scope of this pass)
- `claude_service.py:14` module-level `_openai_client` constructed without key check — still 503s on call rather than import (audit flagged as "STILL BROKEN, minor"; no regression).
- Weekly Calorie Trend single-letter day labels — audit said "not re-checked, assume same".
- Grocery checkbox state still client-only, "Enter Manually Instead" UX — flagged as STILL BROKEN, untouched.
- Static `T` references inside main `nutrition.tsx` component (line 184, 296, 318, 325, etc.) — `T` resolves to themeDark and the audit count of ~18 raw literals targeted the `rgba()` / hex strings, all of which are now tokenized.
