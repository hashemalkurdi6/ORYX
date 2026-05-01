# Home tab — Dusk rollout note

Tab #1 of the dusk-direction rollout. Goal: every hardcoded colour on Home routes through the theme; the screen reads as the same dusk moment as the landing.

## What changed

### Palette

| Where | Before | After | Why |
| --- | --- | --- | --- |
| `index.tsx:291-293` ring track (outer + inner) | hardcoded `rgba(255,255,255,0.06/0.05)` (dark) and `rgba(0,0,0,0.04)` (light) | `theme.glass.border` for both | Routes to Ivory@10% on dark (warm hairline) and `rgba(0,0,0,0.08)` on light. Same visual intent; one source of truth. |
| `index.tsx:1199-1201` macro circles (Protein / Carbs / Fat) | `#ef4444`, `#f59e0b`, `CLR_PALETTE.GREEN` | `theme.status.danger` (Smoulder), `theme.readiness.mid` (Glow), `theme.readiness.high` (Bloom) | Three warm-family hues (deep / light / rose) keep the cluster in dusk while staying clearly distinguishable. CLR_PALETTE.GREEN already resolved to Bloom; made the intent explicit so a future CLR_PALETTE refactor can't regress it. |
| `index.tsx:1258` weight pill bg | `rgba(39,174,96,0.12)` ‖ `rgba(255,255,255,0.08)` | `rgba(224,131,148,0.14)` (Bloom @ 14%) ‖ `T.glass.pill` | Material-green clashed against Vesper. Bloom is the warm-success colour; the un-logged state routes through `glass.pill` (indigo-tinted). |
| `index.tsx:1057` last-session sport icon | icon coloured `T.text.secondary` (Mist) on Ember container | icon coloured `T.accentInk` (Vesper) on Ember container | Periwinkle-on-coral was an accidental warm/cool collision. Vesper-on-Ember is the intentional accent contrast. |
| `index.tsx:1600,1611` error / retry boxes | `rgba(242,122,92,0.12/0.15)` | `rgba(198,100,87,0.12/0.15)` (Smoulder-tinted) | In-family with `theme.status.danger`. |
| `index.tsx:1843` rpe pill | `rgba(255,255,255,0.04)` | `t.glass.pill` | Indigo-tinted on dark, white on light — token-correct. |
| `index.tsx:1962` info modal icon container | `rgba(255,255,255,0.04)` | `t.glass.pill` | Same. |

### AmbientBackdrop — full dark-mode glow set replaced

Previous (lime / blue / coral / electric / blue) was a different design system. The new five-glow set reads as the dusk sky from inside a room:

- Base gradient: `#161A2E` (Vesper) → `#0F1220` (Nightfall-tinted), top to bottom.
- Top-left: **Veil** `#9E83BD`, 0.18, 700 — dusty mauve overhead.
- Top-right: **Horizon** `#7E84C2`, 0.16, 600 — periwinkle, anchors the indigo.
- Bottom-centre: **Ember** `#EE9B7A`, 0.18, 800 — warm afterglow rising from the horizon. Strongest because the bottom of a dusk sky is the brightest band.
- Mid-right: **Bloom** `#E08394`, 0.10, 500 — rose mid-sky.
- Lower-left: **Bloom** `#E08394`, 0.08, 600 — recessive (dropped from 0.09 to 0.08 on auditor's note to break the symmetry with the mid-right Bloom).

Light mode glows untouched.

### Motion (Emil pass)

| Where | Before | After | Why |
| --- | --- | --- | --- |
| `AnimatedCard` (entry stagger wrapper) | `Animated.timing` no easing → defaulted to ease-in-out, 380ms | `Easing.bezier(0.23, 1, 0.32, 1)` strong ease-out, 420ms | Cards should *settle* into place, not ease symmetrically. Built-in default was the weak curve. |
| `SkeletonBlock` pulse | `Animated.timing` no easing → linear, 700ms each way | `Easing.bezier(0.45, 0, 0.55, 1)` symmetric sine in-out | Linear pulse is the most obvious cheap-loader tell; sine breath feels organic. |
| `ScanSweep` (ORYX Intelligence shimmer) | `Animated.timing` no easing on the 3000ms sweep → linear | Strong ease-out on the sweep | Real scanning motion accelerates and decelerates. |
| `RefreshControl` tintColor | `T.text.muted` (Shadow `#6E7396`) | `T.text.secondary` (Mist `#B8B8D2`) | Shadow was barely visible against Vesper during the pull. |

## Adaptations to the palette logic

- **Macro colours within the dusk family.** Considered keeping a green for "Fat" to preserve the green/red/amber learned distinction across the macro cluster; rejected because green doesn't exist anywhere in the dusk system and would re-introduce the visual discontinuity the brief is trying to remove. The three macros sit inside the warm hemisphere now (Smoulder / Glow / Bloom) and are still legible at a glance.

- **Weight-pill "logged today" success colour.** Considered `theme.status.success` (also Bloom) at 12% as a token-direct route, but `theme.accentDim` is Ember-tinted (would confuse "logged" with "primary action"). Hand-rolled `rgba(224,131,148,0.14)` to express Bloom-success at the right alpha without conflating with the brand accent.

## Deferred

- **Press-scale (`scale: 0.97` on `:active`) for the five quick-action pills around `index.tsx:894-927`.** Worth doing per Emil — `activeOpacity={0.75}` alone reads as a dim flash on a Vesper canvas. Skipped here to keep this commit a tight palette-and-key-easings pass; can be folded into the next motion sweep that touches Home, or applied app-wide once a `<PressScale>` helper exists in `components/`. ~12 lines per pill or ~30 lines for a shared helper.
- **Last-session icon intent.** The auditor flagged that the icon container is a solid Ember square — visually loud against indigo. Kept as-is because the user's brief is to apply the palette, not redesign the surface. If on review this reads as overheated, a future pass could replace the solid Ember with `theme.glass.cardHi` and tint the icon with Ember instead.

## Audit items encountered (deferred per the rollout brief)

None — Home was clean of audit items in the bands I touched.

## Files in commit

- `armen/mobile/app/(tabs)/index.tsx` — palette swaps + entry / skeleton / scan easings + RefreshControl tint.
- `armen/mobile/components/AmbientBackdrop.tsx` — new dark-mode glow set + Vesper base gradient.
