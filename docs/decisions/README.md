# Decisions

Architecture / product decision records. One file per decision.

## Filename

`YYYY-MM-DD-short-name.md` — date is the day the decision was made, not when it was written up.

## Template

```markdown
# [Decision title]
**Date:** YYYY-MM-DD
**Status:** [Decided / Reconsidered / Reversed]

## Context
[2-3 sentences on what prompted this]

## Decision
[What was decided, in 1-2 sentences]

## Reasoning
[Why this over alternatives]

## Alternatives considered
- [Option A]: [why rejected]
- [Option B]: [why rejected]

## Consequences
[What this commits us to / what becomes harder]
```

## Rules

- Never edit a decided ADR. If we change our mind, write a new ADR that supersedes it and flip the old one's status to **Reversed** with a link to the new file.
- Keep ADRs short — context, decision, reasoning, alternatives, consequences. If it's longer than a screen, you're writing a design doc, not a decision.
- Link from the relevant feature code with a comment like `// see docs/decisions/2026-04-19-stat-backed-highlights.md` only if the decision is non-obvious from the code.
