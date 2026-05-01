# ORYX — Dusk Landing, Motion Audit

> Companion to `dusk-direction.md`. Polish pass for the landing screen entry timeline, halo cycle, button states, and auth-stack transitions, applied via the **emil-design-eng** lens. Visual direction lands in commit 1; this is commit 2.

The brief is dusk: warm afterglow held against indigo. Motion should *exhale,* not snap. Summer breeze, not playful toy. Anticipation, not arrival.

This audit is about correctness, not decoration. Most of these changes are invisible individually — buttons that respond crisply to a press, a halo that breathes on a true sine curve, a fade that uses a strong ease-out instead of a builtin curve. They compound into "this app feels right."

---

## Frequency check

This is the **landing screen** — first-time / rare experience, not a 100x/day surface. Animation is warranted. The entry timeline is allowed to take its time. Button press feedback, however, is a 100x experience inside a single visit (it has to feel right on every press).

---

## Findings & fixes

| Before | After | Why |
| --- | --- | --- |
| `Easing.out(Easing.quad)` on bg fade-in (300ms) | `Easing.bezier(0.23, 1, 0.32, 1)` (strong ease-out) | Built-in `Easing.quad` is too weak. The strong ease-out has the punch the dusk register needs — first frame is responsive, settle is gentle. |
| `Easing.out(Easing.cubic)` on wordmark slide+fade (400ms) | `Easing.bezier(0.23, 1, 0.32, 1)` | Same. Cubic-out is also weak for an editorial reveal. The custom curve makes the wordmark feel like it's *arriving,* not just appearing. |
| `Easing.out(Easing.quad)` on tagline / subtitle fades | `Easing.bezier(0.23, 1, 0.32, 1)` | Consistent strong ease-out across every entry beat so they feel like one orchestrated reveal. |
| Buttons settle: `withSpring(0, { damping: 14, stiffness: 120, mass: 0.8 })` | `withTiming(0, { duration: 500, easing: Easing.bezier(0.16, 1, 0.3, 1) })` | Computed damping ratio ≈ 0.71 (underdamped, visible bounce). Brief says "no bounce — summer breeze, not playful toy." Replace with a long, strong ease-out — the buttons *settle in,* they don't pop. |
| No press-state feedback on either CTA (only `activeOpacity`) | `transform: scale(0.97)` on press, restored on release | Sonner principle: "Buttons must feel responsive. The UI must feel like it is truly listening to the user." `activeOpacity` alone is invisible on a gradient — scale is the actual signal. |
| Halo breath uses `Easing.inOut(Easing.ease)` | `Easing.inOut(Easing.sin)` | Built-in ease is too weak for a 16s loop. A half-sine curve is the natural breath shape — accelerates into the colour change, decelerates as it settles into the next band. The dwell on each colour feels *held.* |
| `(auth)` stack `contentStyle.backgroundColor: '#0a0a0a'` (pre-dusk near-black) | `theme.bg.primary` (Vesper `#161A2E`) | Hardcoded carryover from the old palette. With the new palette, this flashes as a darker-than-Vesper tone during the cross-fade between landing and signup/login. Match the canvas. |
| Default fade duration on `(auth)` stack | `animationDuration: 220` | Default fade duration on native-stack is ~350ms. 220 keeps the auth navigation crisp without snapping — paired with the matched background, the transition reads as "the dusk continues" rather than "new screen loaded." |

---

## What I left alone (and why)

**The 2.6s entry timeline length.** This is on the long side for first-impression UI, but the brief is explicit about anticipation and unhurried pacing. Compressing to ~1.6s would feel utilitarian. The beats stay where they are.

**The halo's 16s cycle duration.** Already extended from the original 12s in commit 1 to match the dusk register. No further tuning needed — frame-by-frame in slow motion confirms each band gets enough dwell time.

**The 60px button-stack rise.** Generous, but on a cold launch the buttons want a clear arrival moment. Combined with the new strong ease-out timing (replacing the spring), it reads as a settle rather than a slam.

**`activeOpacity` on the gradient CTA.** Kept alongside the scale — the opacity dip on the gradient adds a subtle "warmth dimming briefly" feel as the press lands. Combined with the scale it doubles as state confirmation.

**`reduceMotion` defaults.** The Reanimated `useReducedMotion()` already snaps every shared value to its final state on first paint. The halo also holds on `c0` (Ember) when reduce-motion is on — a single warm halo instead of a cycling one. Correct behaviour; left as-is.

---

## Considered, deferred

**Haptic feedback on the primary CTA.** Per Emil, haptics confirm a button press in the same way scale does — they make the UI feel responsive. iOS `expo-haptics` would deliver a `Haptics.ImpactFeedbackStyle.Light` impact on the warm CTA's press and nothing on the ghost (because the ghost is the cool side — restraint matches its register). This is a new dependency, so deferred behind your approval. Worth ~30 minutes when you're ready to add it.

**Crossfade blur during halo band swaps.** Emil's "use blur to mask imperfect transitions." Currently the three halo layers cross-fade via opacity only. At the swap points (≈ progress 0.5 in the cycle), there is a faint visible "two-objects" feel before the second band fully takes over. A slight `filter: blur(2px)` during the swap would mask it — but RN doesn't support CSS-style filter on arbitrary views without `expo-blur`, and the SVG layers are GPU-rasterised for performance. Deferred — the current swap is good enough; making it perfect would cost the rasterisation optimisation that keeps this at 60fps.

**Stagger between wordmark and tagline (300ms).** Longer than Emil's recommended 30–80ms for list staggers, but those are *items in a list* — these are sequenced semantic beats. Each beat needs to land before the next begins. Left intentionally.

---

## Test plan (do this on a device, with fresh eyes)

Per Emil: "Review your work the next day. You notice imperfections the next day that you missed during development."

1. Cold-launch the app on a real iOS device (not simulator — gestures and haptics differ).
2. Watch the entry timeline at full speed, then slow it down (Xcode → Debug → Slow Animations) to spot any jank.
3. Press and release the primary CTA repeatedly. Confirm: instant scale-down feedback, gentle scale-back, no perceptible delay between touch and animation.
4. Press the ghost CTA the same way. Same feedback profile.
5. Watch the halo for two full cycles (~32 seconds). Confirm: each band feels held; the swap between bands is smooth; no flicker.
6. Tap "Log In" and "Create Account" to confirm the auth-stack fade matches the dusk register — same canvas, no flash to a darker tone.
7. Enable Reduce Motion in iOS settings, relaunch. Confirm: everything snaps to final state, halo holds on Ember.

---

## Files touched in commit 2

- `armen/mobile/components/LandingScreen.tsx` — entry timeline easings, settle-by-timing instead of spring, press-scale on both CTAs.
- `armen/mobile/components/ReadinessHalo.tsx` — sine-curve breath easing.
- `armen/mobile/app/(auth)/_layout.tsx` — Vesper canvas, 220ms fade.
