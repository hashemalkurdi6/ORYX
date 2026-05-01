# Signup flow — glass treatment + animation pass

Date: 2026-05-01
Branch: main
Related commits:
- `feat(signup): glass treatment and entry animations across signup + survey` (51c7aa6)
- `feat(signup): motion polish per emil-design-eng skill` (57e6f28)

## Scope reduction (from CEO review)

The original plan asked for the full 18-screen signup + nutrition survey flow.
After CEO review, scope was reduced to a **vertical slice on three representative
screens** — one input screen, one chip screen, one card screen — to avoid
shipping animation polish on top of four known data-correctness bugs that are
deferred to the next pass.

Slice screens (signup steps in `app/(auth)/signup.tsx`):
- **S2Account** (step 1) — email + password input screen
- **S4Sports** (step 3) — sport-tag chip multi-select
- **S5Goal** (step 4) — primary goal stacked option cards (+ fat-loss-rate cards)

Everything outside the slice (steps 2, 5–11; the entire nutrition-survey.tsx
flow) was **not** restyled or animated in this pass. The shared style
definitions for inputs/tiles/rows/back-button/progress-bar were updated, so the
non-slice screens incidentally inherit the static glass treatment for free —
but no entry animations, focus states, scale bumps, or button polish were
applied to them.

## Bug-fix breadcrumbs

Four `// TODO BUG (audit X.X)` comments were stamped to preserve context for
the next pass:

| Audit | File | Location | Note |
|---|---|---|---|
| 1.1 | `app/(auth)/signup.tsx` | S8Body height TextInput | Single "ft" input parses 5'1" instead of 5'11". Needs separate feet + inches inputs. |
| 1.2 | `app/nutrition-survey.tsx` | line ~360, `getNutritionProfile().catch(() => {})` | Errors swallowed silently. Surface to user with retry. NB: `patchOnboarding` in `services/api.ts:716` has zero callers — likely dead code; the spirit of the bug applies to the survey hydration catch. |
| 1.3 | `app/nutrition-survey.tsx` | `useState<SurveyData>(DEFAULT_SURVEY)` initialiser | Edit flow may reset to defaults. Hydration logic immediately below partly mitigates this — it overwrites only fields that exist on the profile — but the bug as described in the audit can still manifest if the catch on line 360 swallows a 404/network error and prevents hydration from running at all. Verify before fixing. |
| 1.10 | `app/(auth)/signup.tsx` | S12Done `signupComplete()` call | Backend may auto-set `onboarding_complete=True` on signup. Should be False until onboarding actually finishes. |

## What changed per slice screen

### S2Account (step 1 — account details)

**Static (commit 1):**
- All five `TextInput`s now sit on `glass.card` with a `glass.border` rim.
- Username row uses the same glass surface; the `@` glyph re-typed to a Geist medium weight.
- Continue CTA wrapped for entry animation.
- Step header, error box, each input field, and CTA all get individual `FadeSlideIn` wrappers with cascading delays (0/80/150/200/250/300/350/420 ms).

**Motion (commit 2):**
- Inputs swapped to `<GlassInput>` — focuses interpolate `glass.border` → `accent` over 150ms with a faint lime glow via shadow (iOS-only; Android falls back to just the border lerp).
- Username availability indicator swapped to `<UsernameStatus>` — lime check fades in when available, red X fades in when taken, amber pulses while checking.
- Continue replaced with `<PrimaryCTA>` — press-scale 0.98, one-shot pulse when state flips disabled → enabled.

### S4Sports (step 3 — sport tag chips)

**Static (commit 1):**
- Tile bg flips from `bg.elevated` → `glass.pill`.
- Selected tile fills with `accent` and switches to `accentInk` text/icon (was lime-on-lime, hard to read).
- Each chip gets per-item `FadeSlideIn` with 50ms inter-chip stagger.

**Motion (commit 2):**
- Tiles replaced with `<SportChip>` — 1.0 → 1.04 → 1.0 scale bump on tap, animated `glass.pill` ↔ `accent` color lerp on selection, light haptic.
- Continue replaced with `<PrimaryCTA>`.

### S5Goal (step 4 — primary goal + fat-loss-rate cards)

**Static (commit 1):**
- Rows now use `glass.card` (unselected) → `glass.cardHi` + `accent` border (selected).
- Sibling-of-selected rows dim to 60% opacity.
- Per-item `FadeSlideIn` with 50ms inter-card stagger.

**Motion (commit 2):**
- Rows replaced with `<GoalRow>` — animated 200ms transition between glass states + animated dim, scale bump 1.02 on tap, light haptic.
- Continue replaced with `<PrimaryCTA>`.

## Global motion (affects all 11 steps)

These elements are shared across the entire flow, so they get motion regardless
of slice scope:

- **Inter-screen transition** — replaced legacy `Animated.timing` (linear 220ms tween) with Reanimated 3 spring physics (`damping: 22, stiffness: 220, mass: 0.6`). Forward navigation slides current screen left and fades out, then springs the next screen in from the right. Back navigation reverses. Worklet callback + `runOnJS(setStep)` for the swap.
- **Progress bar fill** — animates width via Reanimated shared value over 380ms ease-out on every step change.
- **Back button** — wrapped in a 36×36 circular glass surface (`glass.card` bg, `glass.border` rim) instead of the bare 32px `<View>` it had before.
- **Medium haptic** on every step advance (forward, back, skip).

## Accessibility

`useReducedMotion()` is consulted by every animated component and the screen
transition. When the OS reports reduced-motion preference:

- `FadeSlideIn` snaps to its final state instantly.
- Chip and card scale bumps are skipped.
- Press scale is skipped.
- Screen transitions become instant `setStep()` calls (no slide).
- Animated dim and color lerps snap to their target values.

## Haptics

Wired behind a soft-require — `expo-haptics` is **not currently installed** in
the repo despite the original plan claiming it was. The `tap()` helper at the
top of `signup.tsx` no-ops until the dependency lands. Same pattern GlassCard
uses for `expo-blur`.

To activate haptics: `cd armen/mobile && npx expo install expo-haptics`. No
code changes required afterward.

Mapping:
- **Light**: chip toggle, card selection.
- **Medium**: every step advance (Continue, back, skip — all routed through `navigate()`).
- **Success**: not yet wired (was specced for Apple Health connection success on a screen outside this slice).

## What didn't translate well

- **Lime glow on focused inputs is iOS-only.** Android shadow APIs don't accept colored elevation; the focused border lerp (`glass.border` → `accent`) is the only Android-visible focus signal. Acceptable, but the visual intensity differs across platforms.
- **`bgInput` (the big centered input on S3Name)** received glass treatment via the shared style change but no entry stagger or focus polish — out of slice. It will need a similar `<GlassInput>` swap when the next pass extends to step 2.
- **`activeOpacity={1}` on all animated TouchableOpacity** disables the default opacity press feedback because we're driving feedback via scale instead. If you ever wrap a `<SportChip>`/`<GoalRow>`/`<PrimaryCTA>` inside a parent that expects activeOpacity behavior, the press feedback won't show.
- **`status.dangerSoft` token** added to both palettes for the error-box bg (was a hardcoded `rgba(192,57,43,0.12)`). Cleaner now, but if other error-box-style surfaces exist in the codebase they should migrate to this token.
- **The screen transition spring runs for ~400ms total** (180ms slide-out + spring back-in). Slightly slower than the original 440ms linear-pair but feels less brittle. If users find it too slow on low-end Android, reduce stiffness or fall back to `withTiming`.

## Verification

- `npx tsc --noEmit` is clean for `signup.tsx` and `theme.ts` (one pre-existing unrelated error in `nutrition-survey.tsx:911` — `cuisines_enjoyed` not on `NutritionProfile` — predates this pass).
- `grep -E '#[0-9a-fA-F]{3,8}|rgba\(|rgb\('` returns zero hits in `signup.tsx`.
- Form logic, validation, and navigation order untouched.
- `// TODO BUG` comments present at all four bug locations.
- 60fps simulator verification, light-mode parity, and end-to-end signup smoke test were **not run** in this pass — the user's environment isn't accessible from here. The static glass tokens resolve correctly per theme, so light mode should work, but a manual pass is recommended before shipping.

## What's deferred to the next pass

- Bug fixes for audit items 1.1, 1.2, 1.3, 1.10 (the launch-blockers).
- Glass + motion on remaining signup steps (2, 5–11).
- Glass + motion on the entire nutrition-survey.tsx flow.
- Calculation animation screen (#17 in the original plan) — does not currently exist as a discrete screen; do not build a placeholder, build it as feature work when ready.
- Welcome Home transition (#18) — cross-screen state coordination requiring shared element transitions; treat as its own PR.
- Country dropdown full-screen modal — structural change, not visual; defer until after bugs.
- `expo-haptics` install (one-line `npx expo install expo-haptics` activates all wired haptics).
