# Stat-backed card highlights instead of Instagram-style circle bubbles
**Date:** 2026-04-19
**Status:** Decided

## Context
The first profile/highlights pass copied the Instagram pattern: circular cover-photo bubbles above the grid, each tappable into a story-like reel. Felt off-brand for ORYX — bubbles read social/lifestyle, not performance. We needed a way to surface a user's standout moments without leaning on the Instagram visual language.

## Decision
Replace circle highlight bubbles with stat-backed cards. Each highlight is a card pinned to the profile that shows a real metric (PR pace, longest run, weekly load peak, readiness streak) with a small piece of supporting context, not just a cover image.

## Reasoning
- The numbers ARE the highlight — that's what athletes show off. A stat card respects that.
- Reuses our existing card / type tokens — no new visual primitive.
- Encourages content that's actually about the workout, not just a pretty photo of one.
- Avoids the "second-tier Instagram" feel that kept coming up in feedback.

## Alternatives considered
- **Circle bubbles (Instagram-style)**: rejected — wrong brand signal, copies the wrong product, and incentivises cover-photo curation over substance.
- **Pinned posts (no special UI)**: rejected — works, but loses the "best-of" framing. Hard to glance at a profile and know what someone is good at.
- **Achievement badges**: rejected for v1 — too gamified, and we don't have a robust achievements engine yet.

## Consequences
- Highlights are populated from real user metrics — they require live data to render, which means new accounts have an empty highlights row until they have activity.
- We commit to keeping per-stat highlight cards in sync with the underlying metric source (Strava, Hevy, manual).
- The component stays inside the existing `GlassCard` family, so no new design primitive to maintain.
- Future work: a "pin this stat" gesture from a workout autopsy → highlight.
