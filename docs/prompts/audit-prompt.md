# Audit Mode — No Code Changes

I need a complete audit of the current state of the ORYX codebase before building anything new. This is a **read-only pass**. Do not modify, add, or delete any code, configuration, or database schema. Only read and report.

## What I want

Produce a written audit report covering every screen, feature, and backend surface you're responsible for. Be brutally honest — if something is stubbed, broken, half-wired, or doesn't match the spec, say so. I'd rather find out now than at launch.

## The spec document

The authoritative feature spec is `docs/[spec.md](http://spec.md)`. Reference this when evaluating what should exist vs. what does exist.

## What to cover in the report

For every screen, feature, or endpoint in your area of responsibility, answer:

### 1. Implementation status

- What files exist for this feature?

- What components are built?

- What screens are rendered?

- Is it navigable from the rest of the app, or orphaned?

### 2. Data status — real vs. stubbed

For every data point displayed or stored:

- Does it pull from the real backend / database / integration?

- Is it hardcoded or mocked (e.g., `const mockData = [...]`)?

- Is it calling a real endpoint that returns real data?

- Is it calling a real endpoint that returns empty/null data because no data exists yet?

Be specific. Don't say "mostly real" — say "HRV pulls from `/wellness/hrv` but the endpoint returns null because Apple Health integration is not connected."

### 3. Broken or partial functionality

- Any screens that crash on load?

- Any buttons that do nothing when tapped?

- Any buttons that throw errors?

- Any forms that don't submit?

- Any features that partially work (e.g., "you can log a workout but the workout doesn't save to the database")?

- Any navigation dead-ends?

### 4. Missing from spec

Based on the ORYX spec at `docs/[spec.md](http://spec.md)`, what does your area cover that hasn't been built yet? List every feature, screen, section, and component in your area that's called for in the spec but doesn't exist in the code.

### 5. Light mode status

- Does your area render correctly in light mode?

- Any tokens still hardcoded that break in light mode?

- Any components that look wrong in light mode?

### 6. Backend endpoints (frontend agents)

List every API endpoint your screens call. For each:

- Endpoint path and method (e.g., `GET /wellness/readiness`)

- Is it called successfully?

- Does it return real data, empty data, or an error?

### 6. API surface (backend agent)

List every endpoint that exists. For each:

- Path and method

- What it's supposed to do

- Is it fully implemented, partially implemented, or stubbed?

- Does it have proper auth, validation, and error handling?

- Is it covered by the database schema (i.e., do the tables it reads/writes exist)?

- Is it actually called by the frontend, or orphaned?

### 7. Database schema (backend agent)

List every table. For each:

- Is it created in migrations?

- Is it populated with real data, or empty?

- Are its relationships to other tables intact?

- Any columns referenced in code that don't exist in the schema?

- Any tables in the schema that no code references?

### 8. Integrations status (backend agent)

For each external integration (Strava, Apple HealthKit, Hevy, Whoop, Oura, Open Food Facts, USDA, OpenAI):

- Is OAuth / auth flow implemented?

- Is data actually being pulled?

- Is pulled data being stored?

- Is stored data being used anywhere in the app?

### 9. AI systems (backend agent)

For each AI feature (daily diagnosis, workout autopsy, meal plan generation, nutrition assistant, meal photo scanning):

- Is the prompt written?

- Is the OpenAI call implemented?

- Is caching in place?

- Is rate limiting in place?

- Is the result actually rendered in the frontend?

## Format

Organize the report by screen or feature area. For each, use this template:

[Feature / Screen Name]

Files: [list file paths]

Implementation status: [complete / partial / stubbed / not started]

Data:

- [Data point](...): [real / mocked / empty endpoint / hardcoded]
    

Broken / partial:

- [Specific issue]
    
- [Specific issue]
    

Missing from spec:

- [Feature called for in spec but not built]
    
- [Feature called for in spec but not built]
    

Light mode: [working / needs work / not tested]

Endpoints called / exposed:

## At the end of the report

Provide three summary sections:

### Launch blockers (critical for June 23)

List every issue that would prevent the app from being usable by a first-time user on launch day.

### Launch polish (important but not critical)

Issues that affect quality but wouldn't prevent a usable launch.

### Post-launch (definitely cut from v1.0)

Features in the spec that, realistically, should be deferred to v1.1+ given the June 23 timeline.

## Honesty clause

Do not soften findings to sound positive. If something is broken, say it's broken. If the spec calls for a feature and it doesn't exist, say it doesn't exist. If you're not sure whether something works, say "needs manual testing" — don't guess. If you find something concerning beyond the scope of this audit (security issue, major architectural problem, performance concern), flag it in a "Concerns" section at the end.

## Output

Write the full audit as a Markdown document. Save it at `audits/[agent-name]-audit-[date].md` where agent-name is the area you cover (e.g., `backend`, `home-wellness`, `activity`, `nutrition`, `profile-auth`) and date is today's date in YYYY-MM-DD format.

Do not start writing code. Do not fix anything you find. Just produce the audit document.