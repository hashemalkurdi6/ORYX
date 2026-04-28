# ORYX Docs Vault

This is the project's second brain. An Obsidian vault checked into the repo at `docs/`. Everything load-bearing for product decisions, design, audits, and contributor onboarding lives here.

## What lives here

- `spec.md` — the product spec. Source of truth for every feature decision.
- `audit/` — the canonical audit + priority list. Updated as items ship.
- `decisions/` — ADRs. One file per decision, dated `YYYY-MM-DD-short-name.md`.
- `prompts/` — saved Claude Code prompts that worked, organized by purpose.
- `bugs/` — `known-issues.md` (active) + `fixed.md` (graveyard with commits).
- `design/` — design tokens, component inventory, light-mode issues, animation spec.
- `daily/` — one note per day, `YYYY-MM-DD.md`.
- `weekly/` — Friday review, `YYYY-WW-week-of-Mon-DD.md`.
- `onboarding/` — onboarding docs for Armen, future contributors, future-you.

## How to use with Claude Code

Every Claude Code session should start with:

> Read `docs/spec.md`, `docs/audit/consolidated-priority-list-2026-04-20.md`, and the most recent decisions in `docs/decisions/` for context.

When you make a non-trivial product/architecture decision in a session, ask Claude to write it as a new file in `docs/decisions/` using the template in `decisions/README.md`.

When a prompt produces a great result, save it to `docs/prompts/<category>.md` with a header explaining when to use it.

## Daily workflow

1. Open today's note in `daily/`. If it doesn't exist, copy from the template in `daily/README.md`.
2. Write what you're working on.
3. As things ship, update `audit/consolidated-priority-list-2026-04-20.md` (mark items done, link the commit).
4. If you fixed a bug, move it from `bugs/known-issues.md` → `bugs/fixed.md` with the commit hash.
5. End of day: log "Done" + "Tomorrow" in the daily note.

## Conventions

- **Filenames**: kebab-case. Dates always `YYYY-MM-DD`.
- **Decisions**: never edit a decided ADR — supersede it with a new file referencing the old one.
- **Audits**: the file in `docs/audit/` is canonical. The originals in `audits/` are historical artefacts.
- **Placeholders**: a file with only a header is intentional — content gets pasted in by hand.
- **No code outside `docs/` belongs in this vault.** If you find yourself writing code here, stop and put it in the actual project.
