// ORYX Design System — "Dusk Direction" (2026-04, dark mode).
// Canonical token source. constants/theme.ts re-exports these for legacy imports.
//
// The dark palette is a single specific moment: civil twilight in summer,
// warm afterglow against an indigo sky that hasn't gone black yet. See
// docs/design/dusk-direction.md for the rationale and palette names.
// Color anchors:
//   Vesper    #161A2E   base canvas (cobalt-indigo, never black)
//   Halflight #232846   one step lifted (cards, sheets)
//   Ember     #EE9B7A   primary accent (sun-warmed coral-peach)
//   Bloom     #E08394   warm/active (success / readiness peak)
//   Glow      #F5BC9A   soft warm highlight / readiness mid
//   Smoulder  #C66457   warm-but-darker (danger / readiness low)
//   Horizon   #7E84C2   periwinkle (cool side / signal.load / ghost border)
//   Veil      #9E83BD   dusty mauve transition tone
//   Ivory     #F1E7D5   primary text (warm off-white, not pure white)
//   Mist      #B8B8D2   secondary text (cool periwinkle gray)
//   Shadow    #6E7396   muted text
// Light mode is unchanged in this pass.

export interface ThemeColors {
  bg: {
    primary: string;    // app background
    tint: string;       // subtle tint variant
    secondary: string;  // legacy alias
    elevated: string;   // opaque card fallback (when blur unavailable)
    subtle: string;     // dividers / bars
    ringHalo: string;   // lighter centre for the radial gradient behind the ring
  };

  // Glass surfaces — translucent washes. Layer over bg.
  glass: {
    card: string;       // default card fill
    cardHi: string;     // elevated variant (ORYX Intelligence, focused)
    cardLo: string;     // recessed
    chrome: string;     // nav / top bars
    pill: string;       // chip / tag backgrounds
    border: string;     // 1px card border
    highlight: string;  // top-edge inner highlight line
    rim: string;        // stronger rim
    shade: string;      // bottom shade
  };

  border: string;       // alias of glass.border for legacy code
  hairline: string;
  divider: string;

  text: {
    primary: string;    // headlines, large numbers
    body: string;       // body copy (~0.75 alpha on white)
    secondary: string;  // labels, dim (~0.55 alpha)
    muted: string;      // very dim (~0.35 alpha)
    label: string;      // section labels (0.5 alpha)
  };

  accent: string;       // single brand accent — lime
  accentDim: string;
  accentInk: string;    // text colour on accent backgrounds

  readiness: {
    high: string;
    mid: string;
    low: string;
  };

  signal: {
    load: string;       // electric blue for weekly load, complements lime
    ai: string;         // lime echo for AI treatments
  };

  status: {
    success: string;
    warn: string;
    danger: string;
  };
}

// ── Dark palette ─────────────────────────────────────────────────────────────
// Dusk Direction — see docs/design/dusk-direction.md.
// The base is Vesper (a deep cobalt-indigo). Borders / hairlines / text take
// their hue from Ivory (warm) or Mist (cool periwinkle) — never neutral gray.
// Shadows are Nightfall, never black.
export const themeDark: ThemeColors = {
  bg: {
    primary:  '#161A2E',                     // Vesper — base canvas
    tint:     '#1A1F36',                     // a hair lifted
    secondary:'#1A1F36',
    elevated: '#232846',                     // Halflight
    subtle:   'rgba(241,231,213,0.07)',      // Ivory hairline at 7%
    ringHalo: '#1F2440',                     // slightly warmer indigo behind the readiness ring
  },

  // Indigo-tinted glass — warm Ivory borders/highlights so surfaces feel lit
  // by dusk, not by neutral white. Shade is Nightfall, not black.
  glass: {
    card:      'rgba(35,40,70,0.72)',        // Halflight-tone
    cardHi:    'rgba(45,52,82,0.80)',        // lifted indigo
    cardLo:    'rgba(22,26,46,0.65)',        // recessed Vesper
    chrome:    'rgba(15,18,38,0.72)',        // Nightfall-tone for nav / top bars
    pill:      'rgba(55,62,92,0.85)',
    border:    'rgba(241,231,213,0.10)',     // Ivory at 10%
    highlight: 'rgba(241,231,213,0.12)',
    rim:       'rgba(241,231,213,0.18)',
    shade:     'rgba(15,18,38,0.45)',        // Nightfall at 45%, never #000
  },

  border:   'rgba(241,231,213,0.10)',
  hairline: 'rgba(241,231,213,0.08)',
  divider:  'rgba(241,231,213,0.12)',

  text: {
    primary:   '#F1E7D5',                    // Ivory
    body:      '#D8D2BD',                    // dimmer ivory
    secondary: '#B8B8D2',                    // Mist
    muted:     '#6E7396',                    // Shadow
    label:     '#B8B8D2',                    // Mist
  },

  // Lime is gone. Ember replaces it as the single brand accent.
  // accentInk on Ember reads as Vesper — deep indigo on warm fill, not black.
  accent:    '#EE9B7A',                      // Ember
  accentDim: 'rgba(238,155,122,0.20)',
  accentInk: '#161A2E',                      // Vesper text on Ember fills

  readiness: {
    high: '#E08394',                         // Bloom — warm peak
    mid:  '#F5BC9A',                         // Glow
    low:  '#C66457',                         // Smoulder
  },

  signal: {
    load: '#7E84C2',                         // Horizon — cool periwinkle
    ai:   '#EE9B7A',                         // Ember — AI moves to warm
  },

  status: {
    success: '#E08394',                      // Bloom
    warn:    '#F5BC9A',                      // Glow
    danger:  '#C66457',                      // Smoulder
  },
};

// ── Light palette ────────────────────────────────────────────────────────────
// Values aligned to the Claude Design "ORYX Light" handoff (tokens-light.js):
// cool periwinkle bg, solid white cards with cool-blue drop shadows, darker
// "apple green" accent (#AACC00) that reads on a light surface without going
// radioactive, cool-grey text hierarchy. Glass treatment flips from
// blur-on-translucent (dark) to solid-white + shadow (light) — see GlassCard.
// Light mode is *not* inverted dark. Dark mode's design uses glow, translucency
// and lime-as-luminous-text. Light mode uses shadows, solid borders, and lime
// strictly as a saturated fill / stroke / accent bar — never as text. Every
// surface is a defined solid with a visible edge instead of a translucent wash.
export const themeLight: ThemeColors = {
  bg: {
    primary:  '#FAFAFA',      // clean warm-neutral canvas
    tint:     '#F5F5F7',
    secondary:'#F5F5F7',
    elevated: '#FFFFFF',      // pure-white card surface
    subtle:   'rgba(0,0,0,0.04)',   // track lines / subtle dividers (lighter)
    ringHalo: '#FFF5E6',      // warm ivory centre behind readiness ring
  },

  // Glass on light = solid fills + 1px dark hairline border + drop shadow.
  // GlassCard reads resolvedScheme and renders a shadowed solid on light mode.
  glass: {
    card:      '#FFFFFF',
    cardHi:    '#FFFFFF',
    cardLo:    '#F5F5F7',
    chrome:    'rgba(255,255,255,0.88)',   // tab-bar chrome, near-opaque
    pill:      '#FFFFFF',
    border:    'rgba(0,0,0,0.08)',        // stronger — light needs visible edges
    highlight: 'rgba(255,255,255,0.95)',
    rim:       'rgba(0,0,0,0.10)',
    shade:     'rgba(0,0,0,0.15)',
  },

  border:   'rgba(0,0,0,0.08)',
  hairline: 'rgba(0,0,0,0.06)',
  divider:  'rgba(0,0,0,0.08)',

  text: {
    primary:   '#0F1115',     // near-black for headlines, values, body copy
    body:      '#2A2F3A',     // body text, slightly lighter than primary
    secondary: '#4A515E',     // darker one step — visible labels on white
    muted:     '#6B7180',     // timestamps, hints (darker than before)
    label:     '#4A515E',     // uppercase labels — not near-transparent
  },

  // Accent is a darker apple-green lime — still in the lime family, readable
  // contrast when used as a fill. NEVER used as a text color in light mode.
  accent:    '#AACC00',
  accentDim: 'rgba(170,204,0,0.16)',
  accentInk: '#0F1115',       // dark text on lime fills

  readiness: {
    high: '#4A9600',
    mid:  '#C07800',
    low:  '#C03A18',
  },

  signal: {
    load: '#2A6EC8',
    ai:   '#4A9600',
  },

  status: {
    success: '#4A9600',
    warn:    '#C07800',
    danger:  '#C03A18',
  },
};

// ── Active theme ─────────────────────────────────────────────────────────────
// The `theme` export is mutable on purpose: at app startup (inside the theme
// bootstrap in ThemeProvider) we flood it with either themeDark or themeLight
// based on the user's saved preference, BEFORE any child component mounts.
// This way module-level `import { theme as T }` usages pick up the right
// values on first render.
//
// When the user switches appearance live, we mutate this object in place +
// bump a version key on ThemeContext to force re-render. Components using the
// useTheme() hook update immediately; module-level StyleSheet.create blocks
// only fully re-apply on the next cold start (flagged in the Appearance
// screen).
export const theme: ThemeColors = JSON.parse(JSON.stringify(themeDark));

export type AppearanceMode = 'dark' | 'light' | 'auto';

/** Apply a resolved theme object to the shared `theme` export in place. */
export function applyThemeInPlace(next: ThemeColors) {
  (Object.keys(next) as (keyof ThemeColors)[]).forEach((key) => {
    const value = next[key];
    const current = theme[key] as any;
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      Object.assign(current, value);
    } else {
      (theme as any)[key] = value;
    }
  });
}

/** Resolve the active theme from the user's preference + the device scheme. */
export function resolveTheme(
  mode: AppearanceMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): ThemeColors {
  if (mode === 'light') return themeLight;
  if (mode === 'dark')  return themeDark;
  // 'auto' → mirror the system. Default to dark if the device didn't report.
  return systemScheme === 'light' ? themeLight : themeDark;
}

// ── Typography ──────────────────────────────────────────────────────────────
// Dusk Direction stack:
//   serif (Fraunces) = display moments — wordmark, hero headlines, the
//     occasional italic accent. Used sparingly; carries the editorial register.
//   sans  (DM Sans)  = body / UI / buttons / labels. Humanist-geometric,
//     readable at small sizes, warmer than Inter or Geist.
//   mono  (DM Mono)  = numeric readouts, timestamps, metric tickers.
//
// Font family names below MUST match the keys registered in
// app/_layout.tsx's useFonts() call.
export const type = {
  sans: {
    regular:  'DMSans_400Regular',
    medium:   'DMSans_500Medium',
    semibold: 'DMSans_600SemiBold',
    bold:     'DMSans_700Bold',
  },
  serif: {
    regular:       'Fraunces_400Regular',
    regularItalic: 'Fraunces_400Regular_Italic',
    medium:        'Fraunces_500Medium',
    semibold:      'Fraunces_600SemiBold',
  },
  mono: {
    regular:  'DMMono_400Regular',
    medium:   'DMMono_500Medium',
    // DM Mono ships Light / Regular / Medium only. semibold/bold map to
    // Medium so existing call sites (`TY.mono.bold`) don't break.
    semibold: 'DMMono_500Medium',
    bold:     'DMMono_500Medium',
  },
  size: {
    display:   96,   // hero readiness number
    displaySm: 72,
    h1:        28,   // greeting
    h2:        22,
    h3:        18,
    body:      14,
    small:     12,
    micro:     10,
    tick:      11,   // section labels
  },
  weight: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
  tracking: {
    display:  -0.04,
    tight:    -0.02,
    normal:    0,
    label:     2,
    micro:     1.8,
  },
  // Safety net for the hero number — tabular figures so digits don't wobble
  // between states. Apply to any large numeric display.
  tabular: { fontVariant: ['tabular-nums'] as ['tabular-nums'] },
};

// ── Radii ──────────────────────────────────────────────────────────────────
export const radius = {
  xs:   8,
  sm:  12,
  md:  16,
  lg:  20,   // default card radius per spec
  xl:  22,
  xxl: 28,
  pill: 999,
};

// ── Spacing scale ──────────────────────────────────────────────────────────
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 64,
};

// ── Readiness helper ───────────────────────────────────────────────────────
export function readinessColor(score: number): string {
  if (score >= 80) return theme.readiness.high;
  if (score >= 55) return theme.readiness.mid;
  return theme.readiness.low;
}

// ── Status accent helper ───────────────────────────────────────────────────
// Single accessor for status-tinted accents so components don't redefine
// their own red/yellow/green maps. Prefer this (or `theme.status.<kind>`
// directly) over hardcoded hex like `#c0392b` / `#27ae60` / `#e67e22`.
export type StatusKind = 'success' | 'warn' | 'danger';
export function accentForStatus(kind: StatusKind): string {
  return theme.status[kind];
}

// ── Text-style helper ──────────────────────────────────────────────────────
// Collapse the `{ fontFamily, fontSize, letterSpacing, ... }` boilerplate that
// appears in almost every StyleSheet. Also the canonical way to ensure that
// any `fontWeight` is paired with a matching Geist / JetBrains Mono family —
// never rely on the system default.
//
// Usage:
//   ...textStyle({ weight: 'bold', size: 'h2' })
//   ...textStyle({ weight: 'medium', size: 'micro', mono: true, uppercase: true, tracking: 'label' })

export type SansWeight = keyof typeof type.sans;        // regular | medium | semibold | bold
export type TypeSize   = keyof typeof type.size;         // display | h1 | body | micro | ...
export type TrackingKey = keyof typeof type.tracking;    // display | tight | normal | label | micro

export interface TextStyleOpts {
  weight?: SansWeight;
  size?: TypeSize;
  mono?: boolean;
  color?: string;
  tracking?: TrackingKey;
  letterSpacing?: number;
  uppercase?: boolean;
  tabular?: boolean;
  lineHeight?: number;
}

export function textStyle(opts: TextStyleOpts = {}) {
  const {
    weight = 'regular',
    size = 'body',
    mono = false,
    color,
    tracking,
    letterSpacing,
    uppercase,
    tabular,
    lineHeight,
  } = opts;

  const family = mono ? type.mono : type.sans;
  const ls =
    letterSpacing !== undefined
      ? letterSpacing
      : tracking !== undefined
      ? type.tracking[tracking]
      : undefined;

  return {
    fontFamily: family[weight],
    fontSize: type.size[size],
    ...(color !== undefined ? { color } : null),
    ...(ls !== undefined ? { letterSpacing: ls } : null),
    ...(uppercase ? { textTransform: 'uppercase' as const } : null),
    ...(tabular ? { fontVariant: ['tabular-nums'] as ['tabular-nums'] } : null),
    ...(lineHeight !== undefined ? { lineHeight } : null),
  };
}

export type { ThemeColors as default };
