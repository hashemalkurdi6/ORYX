# Email verification — deferred to Phase 2

**Filed:** 2026-05-02
**Status:** Deferred
**Owner:** Hashem
**Related commits:** `4aeed4b` (original welcome+verify implementation), `7511c64` (domain rename to oryxfitapp.com), this commit (defer CTA)

## What was deferred

The "Confirm my email" CTA was removed from the welcome email. The email now ships as a pure welcome message — no button, no verify link, no "link expires in 24 hours" micro-copy.

## Why

- No production backend is deployed yet
- No `/verify-email` landing page exists at `oryxfitapp.com` (would need backend hosting + subdomain DNS setup)
- A CTA pointing to a 404 or coming-soon page is worse than no CTA — it erodes trust on the first email a user ever gets from us
- Building the landing page requires deploy infra decisions (Railway / Render / etc.) that aren't on this week's scope

## When to revisit

**Week 5–6 of the 9-week plan** (May 25 – June 7), before TestFlight external beta. By then we expect production backend deployed and reachable at a stable URL.

## What needs to happen to restore

1. Deploy backend (Railway / Render — separate decision)
2. Set up `api.oryxfitapp.com` (or chosen subdomain) DNS pointing to backend
3. Build `GET /verify-email` FastAPI route that:
   - Decodes the JWT from the `?token=` query param
   - Marks `user.email_verified = True`
   - Returns an HTML confirmation page (success state + branded styling)
   - **Note:** the existing verify endpoint is `POST /auth/verify-email` (JSON in, JSON out). The link-click flow needs a NEW `GET` handler with HTML response — the POST endpoint stays for any programmatic clients.
4. Update `settings.EMAIL_VERIFY_URL_BASE` to the production URL
5. Restore the verify CTA in `armen/backend/app/templates/welcome_verify.html`:
   - The "First step: confirm this is your email" paragraph
   - The lime CTA button table wrapper with `{{verify_url}}` href
   - The "Link expires in 24 hours" micro-copy
   - The `Once you're in, ` preamble before the next-steps list
   - Pre-removal version is in git at the parent commit of this defer
6. Restore matching content in the `text_body` plaintext branch of `send_welcome_verify_email` in `email_service.py`
7. Restore the subject line: `"Welcome to ORYX. Confirm your email to get started."` (currently `"Welcome to ORYX."`)
8. Wire the `verify_url` param back into the `_render` call (currently dropped — see scaffolding note below)
9. Test end-to-end: signup → email arrives → tap verify CTA → land on confirmation page → `email_verified` flips to True

## What's still wired (forward-compatible scaffolding)

The token generation pipeline is **untouched**. Restoring is template-side only.

- `_create_email_verify_token` still generates the JWT on every signup (`auth.py:250`)
- `_send_welcome_verify_for` still computes `verify_url` and passes it to `send_welcome_verify_email` (`auth.py:269`)
- `send_welcome_verify_email` still accepts the `verify_url` param (just doesn't use it — explicit `_ = verify_url` in the body marks the intentional pass-through)
- `email_verification_sent_at` still records the timestamp on user creation

Tradeoff: small amount of dead-weight work (token gen + URL construction) on every signup until Phase 2. Acceptable. Avoiding it would mean ripping out the token pipeline now and rebuilding it later — more churn than the few microseconds it costs.

## Side effects of current state — for the mobile agent

**Read this before touching any verification UI.**

### `/auth/resend-verification` is now semantically misleading

The backend endpoint **still works** and **still sends** an email. But the email it sends is the new pure welcome message — no verify link. So:

- A user who taps "Resend verification email" in the mobile app will receive a fresh welcome email with no way to verify
- They will assume something is broken (they pressed a button labeled "resend verification" and got something that wasn't a verification email)
- This is a UX trap

**Mobile agent options (pick one before TestFlight):**

1. **Hide the "Resend verification email" button entirely** until Phase 2 verify CTA returns. Cleanest. Recommended for TestFlight.
2. **Rename the button to "Resend welcome email"** to match what actually arrives. Honest but exposes that verification is on hold — may invite questions.
3. **Disable the button + tooltip "Email verification coming soon"**. Compromise — preserves the affordance for muscle memory but tells the user it's intentional.

Decision should land before TestFlight external beta.

### `email_verified` column will stay `False` indefinitely

For all signups during the deferral window. Anything that gates on `email_verified` (none currently — but if you add one, e.g. "verified-only access" to a feature) will block all users.

### Function name `send_welcome_verify_email` is misleading

The function no longer sends a verify CTA. Name kept as-is intentionally — renaming twice (now and again at Phase 2) is more churn than living with the misleading name for ~3 weeks. Documented inline in the function docstring and here.

## Restoration verification checklist (use when Phase 2 lands)

- [ ] `RESEND_FROM_EMAIL` still points to `founder@oryxfitapp.com`
- [ ] Domain still verified in Resend dashboard (DKIM not rotated)
- [ ] `EMAIL_VERIFY_URL_BASE` points to the new prod URL
- [ ] `GET /verify-email` returns 200 with HTML confirmation on a valid token
- [ ] `GET /verify-email?token=invalid` returns a useful error page (not a stack trace)
- [ ] Welcome email rendering preview matches the pre-defer version (compare against `welcome_verify_preview.html` if regenerated)
- [ ] `/auth/resend-verification` end-to-end tested (signup → log in → resend → email with verify link → click → verified)
- [ ] Mobile UI restored (button visible, copy says "Resend verification email" again)
