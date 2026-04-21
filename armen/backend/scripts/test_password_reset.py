"""Verify the password-reset email pipeline end-to-end without needing an inbox.

Invocation:
    cd armen/backend
    source .venv/bin/activate
    python scripts/test_password_reset.py [recipient@example.com]

What it checks:
1. Resend SDK is importable.
2. RESEND_API_KEY is present in the environment.
3. The HTML template renders with a reset URL substituted.
4. resend.Emails.send() returns a message id for the given recipient.

A Resend "id" field in the response proves delivery was accepted by the Resend
API — no inbox check required. Any error (401, 403, 422, unverified-domain,
etc.) is printed with the diagnosis.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.services.email_service import _load_template, _render  # noqa: E402


def main() -> int:
    recipient = sys.argv[1] if len(sys.argv) > 1 else "delivered@resend.dev"

    print("=" * 60)
    print("ORYX password-reset email smoke test")
    print("=" * 60)

    # 1. SDK
    try:
        import resend  # noqa: F401
        print("[ok] resend SDK importable")
    except Exception as e:
        print(f"[FAIL] resend SDK import: {e}")
        return 2

    # 2. Key
    key = settings.RESEND_API_KEY
    if not key:
        print("[FAIL] RESEND_API_KEY is empty — set it in armen/backend/.env")
        return 2
    masked = key[:6] + "…" + key[-4:] if len(key) > 12 else "SET"
    print(f"[ok] RESEND_API_KEY present ({masked})")
    print(f"[info] from    = {settings.RESEND_FROM_EMAIL}")
    print(f"[info] to      = {recipient}")
    print(f"[info] env     = {settings.ENV}")
    print(f"[info] url base= {settings.PASSWORD_RESET_URL_BASE}")

    # 3. Template renders
    try:
        sample_url = f"{settings.PASSWORD_RESET_URL_BASE}?token=test.token.signature"
        html = _render(_load_template("password_reset.html"), reset_url=sample_url)
    except FileNotFoundError as e:
        print(f"[FAIL] template missing: {e}")
        return 2
    required_markers = ["ORYX", "Reset your password", "#D4FF4F", sample_url]
    missing = [m for m in required_markers if m not in html]
    if missing:
        print(f"[FAIL] rendered template missing markers: {missing}")
        return 2
    print("[ok] template renders with branding + reset URL")

    # 4. Live send
    import resend
    resend.api_key = key
    try:
        resp = resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [recipient],
            "subject": "Reset your ORYX password",
            "html": html,
            "text": f"Reset your password: {sample_url}",
        })
    except Exception as e:
        msg = str(e)
        print(f"[FAIL] resend.Emails.send raised: {e}")
        if "401" in msg or "Unauthorized" in msg or "invalid_api_key" in msg:
            print("       → RESEND_API_KEY is invalid. Check the key in your Resend dashboard.")
        elif "403" in msg or "domain is not verified" in msg.lower() or "not_authorized" in msg:
            print("       → The 'from' domain is not verified in Resend.")
            print(f"       → Verify {settings.RESEND_FROM_EMAIL} at https://resend.com/domains")
            print("       → Or temporarily use onboarding@resend.dev as the from address.")
        elif "422" in msg:
            print("       → Request rejected. Likely invalid recipient or from format.")
        return 2

    print(f"[ok] resend API accepted the email. response: {resp}")
    email_id = resp.get("id") if isinstance(resp, dict) else None
    if email_id:
        print(f"[ok] email id = {email_id}")
        print("     (inspect delivery at https://resend.com/emails/" + email_id + ")")
        return 0
    print("[WARN] Resend response had no 'id' field; unusual. Raw response above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
