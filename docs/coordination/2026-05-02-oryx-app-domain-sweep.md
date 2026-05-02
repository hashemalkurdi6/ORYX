# `oryx.app` domain sweep — pre-launch decision

**Filed:** 2026-05-02
**Status:** Deferred to Week 7-8
**Owner:** Hashem
**Related:** `7511c64` (oryxfit.com → oryxfitapp.com rename — narrow scope, did NOT touch oryx.app refs)

## What's deferred

A sweep of every `oryx.app` reference across the codebase, with a per-reference decision on whether to migrate it to `oryxfitapp.com` or leave as-is.

## Why deferred

Most `oryx.app` references are aspirational / marketing URLs (TOS pages, privacy policy URLs, profile share links, invite links, support email address). **They might be real dependencies — and chasing them now risks breaking things we don't understand yet.** Specifically:

- `support@oryx.app` may be tied to existing email forwarding rules, ticketing systems, or App Store contact records
- `https://oryx.app/terms` and `/privacy` may be live web pages with content that hasn't moved
- `com.oryx.app` iOS/Android bundle IDs are **immutable post-App-Store-submission** — touching them after first TestFlight is irreversible
- Profile/invite share URLs (`https://oryx.app/u/{handle}`) may be tied to an existing landing page or web router

A blind find-replace would silently break any of these. The fix is to do it deliberately, per-reference, with verification that each new URL actually resolves before the swap.

## When to revisit

**Week 7-8 of the 9-week plan** (June 8–21), as part of the pre-TestFlight checklist sweep. Far enough out that other domain decisions (web presence, email forwarding, App Store records) will be settled, but before external beta where broken share links or 404 TOS URLs would be visible to real users.

## Inventory at time of filing (2026-05-02)

22 references across 16 files, grouped by category:

### Category A — Bundle IDs (HIGH-RISK to change)

```
armen/mobile/app.json:11          "bundleIdentifier": "com.oryx.app"   (iOS)
armen/mobile/app.json:28          "package": "com.oryx.app"            (Android)
docs/prompts/pre-testflight-checklist.md:101  Bundle ID `com.oryx.app`
```

**Decision required:** Settle BEFORE first TestFlight submission. After TestFlight, this is a one-way door — changing means re-publishing as a different app and losing all existing users.

### Category B — Support email

```
armen/backend/app/templates/password_reset.html:54   footer mailto link
armen/backend/app/services/email_service.py:173      password reset text body
armen/backend/app/main.py:764                        in-app HTML page
armen/backend/app/main.py:802                        in-app HTML page
armen/mobile/app/settings/help.tsx:11                SUPPORT_EMAIL constant
docs/prompts/pre-testflight-checklist.md:61          App Review contact email (`appreview@oryx.app`)
```

**Decision required:** Pick the canonical support email for launch. Verify forwarding works before swapping anywhere. App Store review contact email is a separate decision (Apple sends important emails to that address — must be monitored).

### Category C — Public URLs

```
armen/backend/app/config.py:37    RESEND_FROM_EMAIL default "ORYX <noreply@oryx.app>"
armen/backend/app/config.py:38    PASSWORD_RESET_URL_BASE = "https://oryx.app/reset"
armen/backend/app/config.py:39    EMAIL_VERIFY_URL_BASE   = "https://oryx.app/verify-email"
armen/mobile/app/settings/about.tsx:15      TOS_URL = "https://oryx.app/terms"
armen/mobile/app/settings/about.tsx:16      PRIVACY_URL = "https://oryx.app/privacy"
armen/mobile/app/(tabs)/profile.tsx:543     share profile URL pattern
armen/mobile/app/(tabs)/profile.tsx:1782    share post URL pattern
armen/mobile/app/profile/find-friends.tsx:232  invite URL pattern
armen/mobile/components/AthleteProfileModal.tsx:191  share profile URL
docs/coordination/2026-05-02-welcome-email-prod-env.md:28-29
docs/weekly/2026-W19-week-of-May-04.md:56
```

**Decision required:** Per-URL. For each, verify whether a working page exists at the target before swapping. A broken `oryx.app/terms` would fail App Store review.

### Category D — False positives (NOT domain references — DO NOT change)

```
armen/mobile/contexts/ThemeContext.tsx:27   STORAGE_KEY = 'oryx.appearance'  (AsyncStorage key)
armen/mobile/app/settings/appearance.tsx:3  comment about 'oryx.appearance' storage key
```

These match the substring `oryx.app` but are AsyncStorage identifiers. **Changing them would invalidate every existing user's stored theme preference.**

## Process when revisiting (Week 7-8)

1. Re-grep `oryx\.app` to refresh the inventory (some refs may have moved)
2. For each Category A entry: verify TestFlight status. If submitted, document as immutable and move on. If not submitted, decide.
3. For each Category B entry: verify forwarding works at the target address. Send a test email. Confirm receipt.
4. For each Category C entry: HEAD request the URL. If 200, swap. If 404 / not yet built, defer with explicit note.
5. For each Category D entry: confirm classification, leave alone.
6. Single atomic commit per category to keep the diff legible.

## Anti-checklist (things NOT to do)

- Do NOT run a blind global find-replace on `oryx.app`. AsyncStorage keys, dotted-path identifiers, and config strings will get corrupted.
- Do NOT change bundle IDs after TestFlight submission. One-way door.
- Do NOT change support email without confirming new address forwards reliably. Lost support emails = lost trust.
- Do NOT defer past Week 8. After that, every day of delay is a day of broken share links / TOS URLs visible to external beta users.
