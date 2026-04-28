
````markdown
# ORYX — Final Pre-TestFlight Checklist

I've completed three things manually since the last status report:

1. Created `assets/icon.png` (1024×1024) and `assets/splash.png`
2. Wired Resend as the email provider for password reset (API key set in env)
3. Deployed backend to production with HTTPS, set `EXPO_PUBLIC_API_URL` via EAS secrets, and configured privacy/ToS URLs

Before I submit to TestFlight, I need you to **verify my manual work is correct** and then **complete the remaining items** that don't require me personally.

## Part 1 — Verify my manual work

### 1a. Verify icon and splash assets

- Confirm `./assets/icon.png` exists and is a 1024×1024 PNG
- Confirm it has no alpha channel / no transparency (Apple rejects transparent icons)
- Confirm it has no pre-rounded corners (Apple rounds them automatically)
- Confirm `./assets/splash.png` exists and is an appropriate size (at minimum 1242×2436)
- Confirm `app.json` references them at the correct paths
- If anything is wrong, tell me specifically what — do not silently fix binary assets since you can't regenerate them, but flag the issue clearly

Run this check programmatically:
```python
from PIL import Image
icon = Image.open('assets/icon.png')
print(f"Icon: {icon.size}, mode: {icon.mode}")
# Should print: Icon: (1024, 1024), mode: RGB  (NOT RGBA — RGBA means transparency)
```

### 1b. Verify Resend integration works end-to-end

- Locate the `forgot_password` endpoint in `routers/auth.py`
- Confirm the `# TODO: wire an email provider` comment is gone
- Confirm Resend's Python SDK is imported and used correctly
- Confirm `RESEND_API_KEY` is read from environment, not hardcoded
- Confirm the email template exists and references ORYX branding
- Confirm the reset URL format is correct for mobile deep linking
- Write a test script at `backend/scripts/test_password_reset.py` that creates a throwaway test user, calls `/auth/forgot-password`, prints the response, and verifies via Resend's API that an email was actually sent
- Run the test script and show me the output
- If Resend returns an error, diagnose it

### 1c. Verify production backend deployment

- Confirm `EXPO_PUBLIC_API_URL` is set in EAS secrets by running `eas secret:list`
- Fetch the production backend's health endpoint and confirm it returns 200
- Fetch `/privacy` and `/terms` — confirm they return valid HTML
- Check that the production backend is HTTPS only
- Confirm CORS is configured correctly for mobile
- Check that the `EXPO_PUBLIC_API_URL` value exactly matches the deployed backend URL (no trailing slash mismatch)

If any of the above fail, tell me specifically what's broken and what I need to do.

## Part 2 — Complete the remaining items

### 2a. Create the App Review test account seeder

Add a script at `backend/scripts/seed_review_account.py` that creates a user specifically for Apple App Review:

- Email: `appreview@oryx.app`
- Password: `OryxReview2026!`
- Username: `appreview`
- Display name: "App Reviewer"
- Onboarding completed with realistic answers (age 28, height 5'10", weight 75kg, sport tags Lifting/Running/MMA, goal Maintain, region US, full nutrition survey)
- Seeded data: 14 days of wellness check-ins, 10 logged workouts (5 lifting / 3 running / 2 MMA), 7 days of meals, 3 sample posts, 14 days of weight logs, 7 days of water, calculated readiness score, cached AI daily diagnosis

Script must be **idempotent** — running it twice should not create duplicates.

Document in `backend/scripts/README.md`. Run against production and confirm login works via mobile app.

### 2b. Double-check ALL audit Tier 0 items are resolved

Re-verify with actual tests:

- **0.1 Delete Account:** test the full flow via API
- **0.2 Rate limiting:** hit `/meal-plan/regenerate` 2x and confirm 429; hit `/food/scan` 21x and confirm 429; hit `/auth/login` 11x and confirm IP rate limit
- **0.3 Auth rate limits:** confirmed as part of 0.2
- **0.4 SecureStore:** grep for `AsyncStorage` references related to auth — confirm none remain
- **0.5 CORS + logging + token encryption:** confirm `allow_origins` not `["*"]` in prod, OpenAI prompts not logged at INFO, OAuth tokens encrypted at rest
- **0.6 Media fallback:** confirm base64 fallback removed, backend throws on missing S3/R2 creds
- **0.7 Prompt injection:** confirm input sanitization and output validation in `_generate_replacement_meal`

Concrete evidence per item, not just "grep for filename."

### 2c. Pre-build sanity checks

- `npx expo-doctor` — resolve any issues
- `npx expo install --check` — verify package versions
- Verify `app.json`: unique bundle ID, version `1.0.0`, buildNumber `1`, all permission strings, `ITSAppUsesNonExemptEncryption: false`, HealthKit entitlement
- Confirm no `localhost`, `192.168.*`, or placeholder URLs in mobile code

### 2d. Production-ready verification — full sweep

Confirm:
- No "Coming Soon" alerts anywhere (grep)
- No placeholder text visible to users
- No dev URLs in production builds
- No mock data visible at runtime
- All permission strings specific and honest
- Bundle ID `com.oryx.app`
- App name "ORYX" (not "ORYX Dev" or "ORYX Beta")

Fix any regressions.

## Part 3 — Final report

Produce a single markdown report at `audits/pre-testflight-final-report-{today}.md` with:

### Verified ✅
Items I manually completed that you confirmed are working.

### Fixed in this pass ✅
Items you completed.

### Blocked 🚫
Anything still requiring my action with specific instructions.

### Ready to build
Explicit yes/no: is the codebase ready for `eas build --platform ios --profile production`?

If yes, provide the exact command sequence to run.
If no, tell me exactly what's blocking.

## Rules

- Do not change design, colors, or layout.
- Do not add new features.
- Do not silently fix my manual work — flag issues clearly with remediation steps.
- If anything in Part 1 verification fails, stop and report before proceeding to Part 2.
- Commit each logical unit of work separately.

Start with Part 1 verification. When done, show me the verification results before moving to Part 2.
````