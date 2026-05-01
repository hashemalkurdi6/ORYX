# Week 4 — May 11 – May 17, 2026

Status: Future
Week of master plan: Week 4 of 9
Days remaining to launch (as of Mon): 43 (June 23, 2026)

---

## This week's goal

Close remaining Tier 2 spec gaps in the social layer + backend cleanup, then a Friday audit checkpoint to decide what's safe to defer to v1.1.

By Friday EOD: posts filter and club auto-join working, server-side privacy enforcement in place, Tier 1 stragglers (1.7–1.11) closed, OpenAI key requirement documented or feature gated, Tier 2 re-audited and cut list finalized.

---

## Critical (must ship this week)

- [ ] **Items 2.6 + 2.7 — Posts filter + club auto-join** (Day 16)
  Owner: backend
  Fix `post_type` vs `insight_type` mismatch. Migrate existing data so filter actually works. Auto-join clubs based on sport tags on signup.

- [ ] **Item 2.8 — Privacy server-side enforcement** (Day 17)
  Owner: backend
  Server-side enforcement for private accounts, DM audience, block list, message requests for non-mutuals. Currently relies on mobile-side hiding which is not security.

  > Drift: DMs were tentatively cut from launch in earlier conversations. If DMs are cut, the "DM audience" + "message requests for non-mutuals" portions of 2.8 collapse to no-op. Audit-ops should confirm DM cut status with the user before Day 17 — if DMs are out, this becomes a half-day item covering only private accounts and block list.

- [ ] **Items 1.7 + 1.8 + 1.9 + 1.10 + 1.11** (Day 18)
  Owner: backend (1.7, 1.8, 1.9, 1.10) + mobile (1.11)
  Remove duplicate diagnosis endpoint (1.7). Fix Home strain gauge date comparison (1.8). Verify training load recomputes on `PATCH /rpe` (1.9). Make `/signup` default `onboarding_complete=False` (1.10). Delete legacy `onboarding.tsx` (1.11).

- [ ] **Items 2.13 + 2.14** (Day 19)
  Owner: backend + docs
  Document `OPENAI_API_KEY` requirement clearly (2.13 — partly done in CLAUDE.md, needs to be surfaced to anyone deploying). Implement or remove `readiness_delta_7d` (2.14) — pick one, don't leave the dead field.

- [ ] **Audit checkpoint** (Day 20)
  Owner: audit-ops
  Re-audit Tier 2. Decide what's safe to defer to v1.1. Produce a written cut list. Update consolidated audit. This gates what enters Week 5–6 (light mode + perf) — anything still open in Tier 2 after this checkpoint either lands in Weeks 5–6 polish-buffer or gets explicitly punted.

---

## Coordination expected this week

- **2.6 data migration:** `post_type` → `insight_type` rename touches existing posts. Backend agent should coordinate with audit-ops on whether to backfill (lossless rename) or migrate-and-validate (slower, safer). Audit-ops will run a row-count diff before/after.
- **2.8 vs 2.6:** privacy enforcement (2.8) and posts filter (2.6) both touch the posts query path. Backend agent should land 2.6 first (data shape) then 2.8 (visibility filter on top).
- **1.11 cleanup:** `onboarding.tsx` legacy deletion must wait until 1.10 ships and signup → onboarding flow is verified. Mobile agent: do not delete legacy file before audit-ops verifies the new flow.

---

## Explicitly NOT this week

- No light-mode work (Weeks 5–6).
- No DMs, Moments, portfolio posts.
- No new social features beyond closing audit items.
- No performance work (Week 6).

---

## Last week's review

> To be filled in Friday May 8, 2026 EOD by audit-ops.

---

## End-of-week review

> To be completed Friday May 15, 2026 EOD. Day 20 audit checkpoint deliverable lives here or as a separate file under `docs/audit/` — decide at the time.
