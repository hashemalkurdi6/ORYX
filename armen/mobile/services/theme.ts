// ORYX Design System — Strict monochromatic dark palette
// NO colors except success and danger. No purple, blue, green, gradients, or warm tones.

export interface ThemeColors {
  bg: {
    primary: string;   // #0a0a0a — app background
    secondary: string; // #111111 — section bg
    elevated: string;  // #1a1a1a — cards, inputs, modals
    subtle: string;    // #222222 — hover states, dividers
  };
  border: string;      // #2a2a2a
  text: {
    primary: string;   // #f0f0f0
    secondary: string; // #888888
    muted: string;     // #555555
  };
  accent: string;      // #e0e0e0 — use sparingly for focus/interaction
  status: {
    success: string;   // #27ae60
    danger: string;    // #c0392b
  };
}

export const theme: ThemeColors = {
  bg: {
    primary:   '#0a0a0a',
    secondary: '#111111',
    elevated:  '#1a1a1a',
    subtle:    '#222222',
  },
  border: '#2a2a2a',
  text: {
    primary:   '#f0f0f0',
    secondary: '#888888',
    muted:     '#555555',
  },
  accent: '#e0e0e0',
  status: {
    success: '#27ae60',
    danger:  '#c0392b',
  },
};

// Keep ThemeColors exported as the interface name for backward compat with imports
export type { ThemeColors as default };
