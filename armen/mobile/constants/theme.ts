// ORYX — legacy constants, kept for any remaining direct usages.
// Prefer importing from @/services/theme for new code.

export const BG            = '#0a0a0a';
export const CARD          = '#1a1a1a';
export const CARD_BORDER   = '#2a2a2a';
export const CARD_ELEVATED = '#1a1a1a';

export const TEXT_PRIMARY   = '#f0f0f0';
export const TEXT_SECONDARY = '#888888';
export const TEXT_MUTED     = '#555555';

export const ACCENT = '#e0e0e0';

export const SUCCESS    = '#27ae60';
export const DANGER     = '#c0392b';

// Provider brand colors — do not change
export const STRAVA = '#FC4C02';
export const WHOOP  = '#FF6B35';
export const OURA   = '#00B894';

export const RADIUS_LG = 20;
export const RADIUS_MD = 16;
export const RADIUS_SM = 10;
export const RADIUS_XS = 8;

export const SPACE = 8;

export const Theme = {
  BG, CARD, CARD_BORDER, CARD_ELEVATED,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
  ACCENT, SUCCESS, DANGER,
  STRAVA, WHOOP, OURA,
  RADIUS_LG, RADIUS_MD, RADIUS_SM, RADIUS_XS,
  SPACE,
} as const;

export function recoveryColor(score: number): string {
  if (score >= 70) return SUCCESS;
  if (score >= 40) return '#888888';
  return DANGER;
}
