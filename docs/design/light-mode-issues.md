# Light-mode issues

Tracks light-mode-specific issues from the audit. ORYX is dark-first; light mode is a re-skin, not a swap, so anywhere the dark palette leaks through (hardcoded `#hex` instead of `theme.*`) becomes a visible bug in light mode.

> Placeholder — fill in details as they're triaged from the audit. The big picture below comes from the consolidated audit on 2026-04-20.

## Major findings (from audit)

- **Activity** — 193 hardcoded hex literals. The single largest light-mode debt in the app. Bypasses the theme entirely on the activity tab and most of its sub-screens.
- **Wellness** — 111 hardcoded hex literals. Second-worst.
- **Nutrition** — significant hex usage on cards, ring, and meal-plan UI.
- **Home / Dashboard** — mostly themed, but several status colours (`#c0392b`, `#27ae60`, `#e67e22`) bypass `theme.status.*`.
- **Social / Profile** — partial themeing. Story and post creator surfaces lean on raw colours.

## Cleanup pattern

Replace any of:

- raw hex (`'#1a1a1a'`, `'#27ae60'`, etc.)
- raw `rgba(...)` strings outside `services/theme.ts`

with the corresponding token from `armen/mobile/services/theme.ts`. For status accents prefer `theme.status.success / .warn / .danger` (or `accentForStatus(kind)`) over per-component red/yellow/green maps.

See `docs/design/tokens.md` for the canonical token list.
