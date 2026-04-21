"""Transactional email delivery via Resend."""

from __future__ import annotations

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
                "Didn't request this? You can safely ignore this email — your password won't change.\n\n"
                "— ORYX\nsupport@oryx.app\n"
            ),
        })
        return True
    except Exception as e:
        logger.exception("Failed to send password reset email to %s: %s", to_email, e)
        return False
