// ORYX — legacy constants. Kept so existing direct-imports keep building.
// Prefer importing from @/services/theme for new code.

import { theme, radius, space } from '@/services/theme';

export const BG            = theme.bg.primary;
export const CARD          = theme.bg.elevated;
export const CARD_BORDER   = 'rgba(255,255,255,0.08)';
export const CARD_ELEVATED = theme.bg.elevated;

export const TEXT_PRIMARY   = theme.text.primary;
export const TEXT_SECONDARY = theme.text.secondary;
export const TEXT_MUTED     = theme.text.muted;

export const ACCENT = theme.accent;

export const SUCCESS = theme.status.success;
export const DANGER  = theme.status.danger;

// Provider brand colors — unchanged
export const STRAVA = '#FC4C02';
export const WHOOP  = '#FF6B35';
export const OURA   = '#00B894';

export const RADIUS_LG = radius.lg;
export const RADIUS_MD = radius.md;
export const RADIUS_SM = radius.sm;
export const RADIUS_XS = radius.xs;

export const SPACE = space[2];

export const Theme = {
  BG, CARD, CARD_BORDER, CARD_ELEVATED,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
  ACCENT, SUCCESS, DANGER,
  STRAVA, WHOOP, OURA,
  RADIUS_LG, RADIUS_MD, RADIUS_SM, RADIUS_XS,
  SPACE,
} as const;

export function recoveryColor(score: number): string {
  if (score >= 70) return theme.readiness.high;
  if (score >= 40) return theme.readiness.mid;
  return theme.readiness.low;
}
