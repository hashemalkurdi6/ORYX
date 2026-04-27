# Home + Wellness Fix Log — 2026-04-26

- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/dashboard.tsx — Deleted dead 1293-line screen (was registered with `href: null`).
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/_layout.tsx:179 — Removed orphan `<Tabs.Screen name="dashboard" />` registration.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/index.tsx:117-124,656 — Replaced magic `300` with documented `DEFAULT_DAILY_LOAD_TARGET` constant; comments call out that it's a per-user-median fallback until backend ships a personalised target.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx — Switched from frozen module-level `theme as T` to `useTheme()` hook with `useMemo(createStyles, [t])` factory so theme toggle is reactive without app restart.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:197-206,250-260 — Recovery card now reads `recovery_score`/`recovery_color` from `/home/diagnosis` (backend already attaches them); falls back to "AWAITING DATA"/`text.muted` rather than 0/yellow.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:101,138-180 — Daily check-in form rewritten to 4-field Hooper Index (sleep_quality / fatigue / stress / muscle_soreness, 1–7 scale) so submissions satisfy `wellness_logged_today` on Home.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:284-326 — Today's Check-in chip row now renders 4 Hooper components with inverted color mapping (lower=better → green).
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:506-528 — Recent check-ins history shows S/F/St/So values + 4 dots instead of legacy M/E/S.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:822-846 — Modal stepper updated to 1–7 with hint copy per Hooper field.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:567-606 — HRV Trends chart now overlays daily series + 7d-avg guide line + 30d-avg guide line with a legend, matching spec's 3-series overlay.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:643-674 — Sleep Trends chart switched from LineChart to BarChart over 14 nights per spec.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:733-797 — Wellness History (Hooper) replaced single-totals line with 4-series per-component overlay (sleep / fatigue / stress / soreness) plus legend; chart-kit doesn't ship a true stacked-area renderer, so overlaid lines are the no-extra-deps approximation.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/wellness.tsx:925 — `avgChip` background switched from hardcoded `rgba(0,196,140,0.15)` to `t.bg.tint` token.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/mobile/app/(tabs)/index.tsx:417-460 — `ScanSweep` gradient now derives lime accent from `theme.accent` via a new `hexToRgba()` helper; light-mode accent renders correctly instead of an invisible hardcoded dark-mode lime.
