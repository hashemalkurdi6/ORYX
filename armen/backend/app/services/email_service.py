"""Transactional email delivery via Resend."""

from __future__ import annotations

import html as _html
import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"


def _load_template(name: str) -> str:
    return (_TEMPLATE_DIR / name).read_text(encoding="utf-8")


def _render(template: str, **vars: str) -> str:
    out = template
    for key, value in vars.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def _mask_email(email: str) -> str:
    """Privacy-safe log representation: keeps first char of local + domain."""
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if len(local) <= 1:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


# Reply-to / contact line.
# TODO(launch-blocker): once founder@oryxfitapp.com forwarding to Hashem's inbox
# is verified working, swap _CONTACT_LINE back to the "just reply to this email"
# version below. Until then we direct users to compose a fresh email so we
# don't promise replies that vanish into a deliverability void.
#   _CONTACT_LINE = (
#       "If you hit any issues or have feedback, just reply to this email. "
#       "It comes straight to me."
#   )
_CONTACT_LINE = (
    "If you hit any issues or have feedback, email founder@oryxfitapp.com."
)


def send_welcome_verify_email(
    to_email: str,
    verify_url: str,
    first_name: str | None = None,
) -> bool:
    """Send the combined welcome + email-verification message.

    Replaces the old send_email_verification (which crudely string-swapped the
    password-reset template). Personal founder voice, single CTA = verify link.
    Non-blocking failure: returns False, logs, never raises.
    """
    if not settings.RESEND_API_KEY:
        logger.warning(
            "RESEND_API_KEY not configured; skipping welcome+verify email to %s",
            _mask_email(to_email),
        )
        return False

    try:
        import resend
    except ImportError:
        logger.error("resend SDK not installed; cannot send welcome+verify email")
        return False

    # Sanitize first_name before substituting into HTML (user-supplied via
    # signup payload). Plaintext branch can use the raw value.
    safe_name = (first_name or "").strip()
    if safe_name:
        greeting_html = (
            f'<p style="font-size:16px;line-height:1.6;color:#F5F5F0;margin:0 0 16px 0;">'
            f"Hey {_html.escape(safe_name)},</p>"
        )
        greeting_text = f"Hey {safe_name},\n\n"
    else:
        greeting_html = ""
        greeting_text = ""

    resend.api_key = settings.RESEND_API_KEY
    html_body = _render(
        _load_template("welcome_verify.html"),
        greeting=greeting_html,
        verify_url=verify_url,
        contact_line=_CONTACT_LINE,
    )

    text_body = (
        "Welcome to ORYX\n\n"
        f"{greeting_text}"
        "Welcome to ORYX. I built this because I was tired of using five "
        "different fitness apps that never talked to each other. And even more "
        "tired of looking at numbers that didn't actually tell me anything "
        "about my training.\n\n"
        "ORYX is the app I wished existed. It connects your fitness data and "
        "uses AI to actually explain what's happening with your body in plain "
        "English.\n\n"
        "First step: confirm this is your email. Takes one second.\n\n"
        f"  {verify_url}\n\n"
        "Link expires in 24 hours. Didn't sign up for ORYX? You can safely "
        "ignore this. Nothing happens.\n\n"
        "Once you're in, here's what'll get you the most out of it from day one:\n\n"
        "  - Finish your onboarding (about 5 minutes)\n"
        "  - Connect Apple Health so we can read your sleep, heart rate, and activity\n"
        "  - Log your first workout\n\n"
        f"{_CONTACT_LINE}\n\n"
        "Train hard,\n"
        "Hashem\n"
        "Founder, ORYX\n"
    )

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "Welcome to ORYX. Confirm your email to get started.",
            "html": html_body,
            "text": text_body,
        })
        logger.info(
            "Welcome+verify email sent to %s (named=%s)",
            _mask_email(to_email),
            bool(safe_name),
        )
        return True
    except Exception as e:
        logger.exception(
            "Failed to send welcome+verify email to %s: %s",
            _mask_email(to_email),
            e,
        )
        return False


def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """Send the password-reset email. Returns True on success, False on any failure.

    Failures are logged but never raised — the caller always returns the same
    generic 202 response so we don't leak which addresses are registered.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured; skipping password reset email to %s", to_email)
        return False

    try:
        import resend  # local import so the app boots even if the SDK is missing
    except ImportError:
        logger.error("resend SDK not installed; cannot send password reset email")
        return False

    resend.api_key = settings.RESEND_API_KEY
    html = _render(_load_template("password_reset.html"), reset_url=reset_url)

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": "Reset your ORYX password",
            "html": html,
            "text": (
                "Reset your ORYX password\n\n"
                "We received a request to reset the password on your ORYX account.\n"
                f"Open this link within 30 minutes to choose a new password:\n\n{reset_url}\n\n"
                "Didn't request this? You can safely ignore this email. Your password won't change.\n\n"
                "ORYX\nsupport@oryx.app\n"
            ),
        })
        return True
    except Exception as e:
        logger.exception("Failed to send password reset email to %s: %s", to_email, e)
        return False
