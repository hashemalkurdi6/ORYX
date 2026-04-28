# Design tokens

Canonical token reference, extracted from [armen/mobile/services/theme.ts](../../armen/mobile/services/theme.ts). The tokens listed here are the values components should use — never hardcode hex.

ORYX is dark-first. The dark palette is the design source of truth; the light palette is a separate hand-off (Claude Design "ORYX Light"), not an inversion.

## Colors

### Background — `theme.bg.*`

| Token | Dark | Light | Notes |
|---|---|---|---|
| `bg.primary` | `#141820` | `#FAFAFA` | App background. Warm blue-charcoal on dark; clean warm-neutral on light. |
| `bg.tint` | `#1A1F2A` | `#F5F5F7` | Subtle tint variant. |
| `bg.secondary` | `#1A1F2A` | `#F5F5F7` | Legacy alias of `tint`. |
| `bg.elevated` | `#1C222E` | `#FFFFFF` | Opaque card fallback when blur unavailable. Pure white on light. |
| `bg.subtle` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.04)` | Dividers / bars. |
| `bg.ringHalo` | `#1A1F2A` | `#FFF5E6` | Lighter centre for the radial gradient behind the readiness ring. |

### Glass surfaces — `theme.glass.*`

Translucent washes layered over `bg`. On light mode these flip to solid fills with a hairline border + drop shadow (see [GlassCard](../../armen/mobile/components/GlassCard.tsx)).

| Token | Dark | Light | Notes |
|---|---|---|---|
| `glass.card` | `rgba(28,34,46,0.72)` | `#FFFFFF` | Default card fill. |
| `glass.cardHi` | `rgba(36,44,60,0.80)` | `#FFFFFF` | Elevated variant (ORYX Intelligence, focused). |
| `glass.cardLo` | `rgba(20,26,38,0.65)` | `#F5F5F7` | Recessed. |
| `glass.chrome` | `rgba(18,22,32,0.70)` | `rgba(255,255,255,0.88)` | Nav / top bars. |
| `glass.pill` | `rgba(44,54,72,0.85)` | `#FFFFFF` | Chip / tag backgrounds. |
| `glass.border` | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.08)` | 1px card border. |
| `glass.highlight` | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.95)` | Top-edge inner highlight line. |
| `glass.rim` | `rgba(255,255,255,0.18)` | `rgba(0,0,0,0.10)` | Stronger rim. |
| `glass.shade` | `rgba(0,0,0,0.40)` | `rgba(0,0,0,0.15)` | Bottom shade. |

### Borders / dividers

| Token | Dark | Light |
|---|---|---|
| `border` | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.08)` |
| `hairline` | `rgba(255,255,255,0.09)` | `rgba(0,0,0,0.06)` |
| `divider` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.08)` |

`border` is an alias of `glass.border` for legacy code.

### Text — `theme.text.*`

| Token | Dark | Light | Use |
|---|---|---|---|
| `text.primary` | `#F0F2F6` | `#0F1115` | Headlines, large numbers. |
| `text.body` | `#CED4E0` | `#2A2F3A` | Body copy (~0.75 alpha on white in dark). |
| `text.secondary` | `#8B95A8` | `#4A515E` | Labels, dim (~0.55 alpha in dark). |
| `text.muted` | `#525E72` | `#6B7180` | Very dim (~0.35 alpha in dark). Timestamps, hints. |
| `text.label` | `#8B95A8` | `#4A515E` | Section labels (uppercase). |

### Accent

| Token | Dark | Light | Notes |
|---|---|---|---|
| `accent` | `#DEFF47` | `#AACC00` | Single brand accent — lime / apple-green on light. NEVER used as text color in light mode. |
| `accentDim` | `rgba(222,255,71,0.20)` | `rgba(170,204,0,0.16)` | Tinted fill. |
| `accentInk` | `#0E1400` | `#0F1115` | Text colour on accent backgrounds. |

### Readiness — `theme.readiness.*`

Used by the readiness ring and any score-coloured surface.

| Token | Dark | Light |
|---|---|---|
| `readiness.high` | `#A8EF3A` | `#4A9600` |
| `readiness.mid` | `#FFD04A` | `#C07800` |
| `readiness.low` | `#FF6B4A` | `#C03A18` |

Helper: `readinessColor(score: number)` — `>=80` high, `>=55` mid, else low.

### Signal — `theme.signal.*`

| Token | Dark | Light | Use |
|---|---|---|---|
| `signal.load` | `#5BA8FF` | `#2A6EC8` | Electric blue for weekly load — complements lime. |
| `signal.ai` | `#DEFF47` | `#4A9600` | Lime echo for AI treatments. |

### Status — `theme.status.*`

Single source for tinted accents. Use these (or `accentForStatus(kind)`) instead of per-component red/yellow/green.

| Token | Dark | Light |
|---|---|---|
| `status.success` | `#A8EF3A` | `#4A9600` |
| `status.warn` | `#FFD04A` | `#C07800` |
| `status.danger` | `#FF6B4A` | `#C03A18` |

### Provider brand colours

Used only for provider badges / oauth surfaces. Imported from `constants/theme.ts`.

| Token | Value |
|---|---|
| `STRAVA` | `#FC4C02` |
| `WHOOP` | `#FF6B35` |
| `OURA` | `#00B894` |

## Spacing — `space[n]`

```
0  → 0
1  → 4
2  → 8
3  → 12
4  → 16
5  → 20
6  → 24
7  → 32
8  → 40
9  → 48
10 → 64
```

## Radii — `radius.*`

```
xs   → 8
sm   → 12
md   → 16
lg   → 20   ← default card radius per spec
xl   → 22
xxl  → 28
pill → 999
```

## Typography — `type.*`

### Family

- **Geist** — UI / headlines / body. `type.sans.{regular|medium|semibold|bold}`.
- **JetBrains Mono** — labels, tickers, timestamps, large metric numbers. `type.mono.{regular|medium|semibold|bold}`.

Family names must match the keys registered in [app/_layout.tsx](../../armen/mobile/app/_layout.tsx)'s `useFonts()` call.

### Sizes — `type.size.*`

| Token | Size | Use |
|---|---|---|
| `display` | 96 | Hero readiness number. |
| `displaySm` | 72 | |
| `h1` | 28 | Greeting. |
| `h2` | 22 | |
| `h3` | 18 | |
| `body` | 14 | |
| `small` | 12 | |
| `micro` | 10 | |
| `tick` | 11 | Section labels. |

### Weights — `type.weight.*`

`regular` 400 · `medium` 500 · `semibold` 600 · `bold` 700.

### Tracking — `type.tracking.*`

| Token | Value |
|---|---|
| `display` | -0.04 |
| `tight` | -0.02 |
| `normal` | 0 |
| `label` | 2 |
| `micro` | 1.8 |

### Helper: `textStyle(opts)`

Collapses `{ fontFamily, fontSize, letterSpacing, ... }` boilerplate. Pair `fontWeight` with the matching family — never rely on the system default.

```ts
...textStyle({ weight: 'bold', size: 'h2' })
...textStyle({ weight: 'medium', size: 'micro', mono: true, uppercase: true, tracking: 'label' })
```

`type.tabular` adds `fontVariant: ['tabular-nums']` so digits don't wobble between states. Apply to any large numeric display.

## Theme runtime

- `theme` is mutable on purpose. The ThemeProvider floods it with `themeDark` or `themeLight` at startup, before any child mounts, so module-level `import { theme as T }` picks up the right values on first render.
- Live appearance switches mutate `theme` in place and bump a version key on `ThemeContext`. `useTheme()` consumers update immediately; module-level `StyleSheet.create` blocks fully re-apply only on the next cold start.
- `resolveTheme(mode, systemScheme)` returns the right palette for `'dark' | 'light' | 'auto'`.

## Don't

- Don't hardcode `#hex` or `rgba(...)` outside `services/theme.ts`. Use a token.
- Don't redefine per-component status maps (red/yellow/green). Use `theme.status.*` or `accentForStatus(kind)`.
- Don't use `accent` as a text colour in light mode.
