# 2026-05-01 — Revert dusk palette, keep lime + GlassCard

## Decision

Reverted the dusk visual direction (warm twilight palette, Fraunces/DM Sans
typography, Ember/Bloom/Horizon tokens) and restored the canonical lime +
near-black palette with the GlassCard design system as the single direction
for ORYX.

## Context

Between `a80118f` and `a84195b` we ran a dusk-palette experiment covering
the landing screen, auth stack, and home tab. Dusk swapped the lime accent
for an Ember warm-orange, replaced Geist/JetBrains Mono with Fraunces/DM
Sans, and recast the dark canvas to Vesper indigo.

## Why we reverted

_TBD — to be filled in._

## What we kept

The landing-screen polish that predated dusk stays in place:

- `4789468` — premium entry animation and ambient backdrop
- `bd7e0b9` — icon.png + splash.png from Mark B geometry
- `f4b7014` — soft aurora-style ambient backdrop
- `5aeecf0` — crossfaded `<Rect>` halo bands (replaces animated `<Stop>`)
- `e8252a5` — rasterised halo gradient layers (perf)

The audit pass (`231aff2`, `5c98a97`) merged in via `9c48a0e` also remains
intact — those were light-mode/runtime fixes orthogonal to dusk.

## What we reverted

- `a80118f` — feat(landing): dusk visual direction (palette, typography, surfaces)
- `16aa5fb` — feat(landing): motion polish per emil-design-eng skill
- `a84195b` — feat(theme): apply dusk palette to home

The merge commit `9c48a0e` itself was not reverted: reverting it with
`-m 1` would strip the audit pass; with `-m 2` would strip the landing
animations and icon work. The three underlying dusk-content commits were
reverted individually instead, leaving the merge as a historical record.

## Preservation

The complete dusk state is tagged `dusk-experiment-archived` and pushed to
the remote. The design notes (`dusk-direction.md`, `dusk-motion-audit.md`,
`dusk-rollout/home.md`) live under `docs/design/archived/`.

## Canonical direction going forward

Lime accent (`#DEFF47` dark, `#AACC00` light) on near-black `#141820`
canvas, Geist + JetBrains Mono typography, GlassCard surfaces with hairline
borders. Light mode untouched throughout.
