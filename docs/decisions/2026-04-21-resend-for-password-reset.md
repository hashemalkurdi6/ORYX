# 2026-04-21 — Resend for password reset transactional email

**Date:** 2026-04-21
**Status:** Decided

## Context

Item 2.3 in the audit (`docs/audit/consolidated-priority-list-2026-04-20.md`)
required end-to-end password reset before App Store submission. That meant
choosing a transactional email provider — App Store reviewers will test the
forgot-password flow, and dev-only token echo is not acceptable in production.

The decision was made in-flight while shipping `c43f394 feat: App Store
rejection-prevention pass + Resend password reset` and was never written up.
This ADR is retrospective documentation — recorded during the W19 reconciliation
on 2026-05-02 to close the coordination gap flagged in the W19 plan.

## Decision

Use [Resend](https://resend.com) as the transactional email provider for
password reset emails. Single template (`password_reset.html`), single sender
identity (`RESEND_FROM_EMAIL`), no other transactional templates planned
pre-launch.

## Reasoning

- API-first, no SMTP config, no domain warmup ceremony for low volume
- Free tier covers expected pre-launch + early-launch volume (3k/month)
- Template management lives in code, not in a vendor UI — no drift between
  dev and prod templates
- Python SDK is thin enough to not be a lock-in concern; switching providers
  later means rewriting `app/services/email_service.py`, not the call sites

## Alternatives considered

- **SendGrid:** more mature, more features, more config. Overkill for one
  template; the free tier requires identity verification dance that costs more
  setup time than the actual integration.
- **AWS SES:** cheapest at scale, but we're not at scale. Sandbox-mode escape
  + domain verification + bounce handling adds days of setup for one email.
- **Postmark:** good reputation, similar shape to Resend. Resend's developer
  experience felt cleaner and the docs were faster to ship against.
- **Roll our own SMTP:** vetoed — App Store reviewers expect deliverability,
  and DKIM/SPF/DMARC setup is not where pre-launch time should go.

## Consequences

- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PASSWORD_RESET_URL_BASE` are now
  required prod env vars. Without `RESEND_API_KEY`, password reset returns
  202 but no email sends — failure is silent to the user by design (anti-
  enumeration), but ops must monitor Resend's dashboard for delivery.
- Email template lives at `armen/backend/app/services/email_service.py` and
  must stay in sync with the reset URL shape (`PASSWORD_RESET_URL_BASE`).
- Adding future transactional emails (welcome, verification, weekly digest)
  means new templates in the same service — not a new provider decision.
- Vendor lock-in is shallow: ~50 lines of code to swap. Acceptable.

## Related

- Backend wiring: `armen/backend/app/services/email_service.py`,
  `armen/backend/app/routers/auth.py:387` (`POST /auth/forgot-password`)
- Test script: `armen/backend/scripts/test_password_reset.py`
- Config: `armen/backend/app/config.py` (lines 36, 38)
- Shipped in: `c43f394 feat: App Store rejection-prevention pass + Resend password reset`
