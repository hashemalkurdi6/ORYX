# Welcome+verify email — production env vars required

**Filed:** 2026-05-02
**Owner:** Hashem (you)
**Blocks:** Welcome+verify email actually firing in production
**Implementation commit:** `4aeed4b`

## What's at stake

Commit `4aeed4b` shipped the code that sends a combined welcome + email-
verification message on every signup, fired from `founder@oryxfitapp.com` via
Resend's transactional API.

**The code is live and won't error.** But without the production env vars
below, `send_welcome_verify_email` returns `False` after logging a warning,
and the user receives nothing. Signup still succeeds. The failure is silent
to the user and only visible in backend logs.

**Net effect if you forget this:** new signups get no welcome email, no
verification email, and no signal that anything is wrong. They just never
hear from you.

## What needs to be set in Railway / Render (or whatever runs prod)

| Env var | Required value | Why |
|---|---|---|
| `RESEND_API_KEY` | Your live Resend API key | Without it the send call short-circuits to `return False` |
| `RESEND_FROM_EMAIL` | `Hashem from ORYX <founder@oryxfitapp.com>` | Sender identity for both welcome+verify and password reset. Default is still `ORYX <noreply@oryx.app>` which is the wrong domain |
| `EMAIL_VERIFY_URL_BASE` | `https://oryx.app/verify-email` (or wherever your verify landing page lives in prod) | Already defaulted, but worth confirming the prod value matches the actual landing page |

## Two prerequisite steps before flipping the env vars

1. **Verify `oryxfitapp.com` in Resend.** Add the domain in Resend's dashboard, then add the SPF (TXT), DKIM (3 CNAMEs), and recommended DMARC (TXT) records to your DNS provider. Resend marks the domain verified usually within 15 minutes of DNS propagation. **Do not flip `RESEND_FROM_EMAIL` to `founder@oryxfitapp.com` until Resend reports the domain verified — sends will hard-fail otherwise.**

2. **Set up `founder@oryxfitapp.com` mailbox or forwarding.** Right now the welcome email reads *"If you hit any issues or have feedback, email founder@oryxfitapp.com."* — a fallback because forwarding wasn't live at ship time. Once you have it forwarding to your real inbox, edit `_CONTACT_LINE` in `armen/backend/app/services/email_service.py` to swap back to the warmer *"just reply to this email. It comes straight to me."* version (the original copy is preserved as a comment right above the active assignment).

## How to verify it's working in prod

After setting the env vars and confirming the domain, run the smoke test against a real address you control:

```bash
cd armen/backend
python scripts/test_welcome_email.py <your-email> <your-first-name>
```

Expected: exit 0, log line `Welcome+verify email sent to ...`, email arrives in inbox within ~30 seconds. If exit 1 with "FAIL — Resend rejected the request", check the logs for the specific Resend error — most likely cause is the sender domain isn't verified yet.

## How the test script behaves in CI

The test script is portable. `pydantic-settings` reads env vars from the
process environment first, `.env` second. In CI/prod where secrets come
from the platform's env config (Railway/Render/GitHub Actions secrets),
no `.env` file is needed; the script picks up the env vars directly.
Locally, the `.env` file in `armen/backend/` works as a fallback.

The script bails gracefully (exit 1, no exception) when `RESEND_API_KEY`
is missing, so it's safe to dry-run in any environment.

## Related

- W19 plan entry: `docs/weekly/2026-W19-week-of-May-04.md` — welcome email under Critical scope
- Resend ADR: `docs/decisions/2026-04-21-resend-for-password-reset.md` — original transactional email provider decision
- Implementation: commit `4aeed4b`
