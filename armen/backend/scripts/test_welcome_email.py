"""Manual smoke test for the welcome+verify email.

Sends a real email via Resend so you can eyeball the rendering in your inbox.

Usage (from armen/backend/):
    python scripts/test_welcome_email.py <recipient-email> [first-name]

Examples:
    python scripts/test_welcome_email.py mainhashemk@gmail.com Hashem
    python scripts/test_welcome_email.py test@example.com

Requires RESEND_API_KEY + RESEND_FROM_EMAIL in env (or .env).

Exit codes:
    0  Resend API accepted the request
    1  Send failed (missing API key, unverified domain, network error, etc.)
    2  Bad invocation
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.services.email_service import send_welcome_verify_email  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    recipient = sys.argv[1]
    first_name = sys.argv[2] if len(sys.argv) > 2 else None

    print("=" * 60)
    print("Welcome+verify email smoke test")
    print("=" * 60)
    print(f"  RESEND_FROM_EMAIL  : {settings.RESEND_FROM_EMAIL!r}")
    print(f"  RESEND_API_KEY set : {bool(settings.RESEND_API_KEY)}")
    print(f"  EMAIL_VERIFY_URL   : {settings.EMAIL_VERIFY_URL_BASE}")
    print(f"  Recipient          : {recipient}")
    print(f"  First name         : {first_name!r}")
    print("=" * 60)

    if not settings.RESEND_API_KEY:
        print("\nERROR: RESEND_API_KEY is not set. Set it in armen/backend/.env")
        print("       and re-run. The script logic is fine; env just isn't ready.")
        return 1

    fake_verify_url = (
        f"{settings.EMAIL_VERIFY_URL_BASE}?token=smoke-test-token-not-real"
    )

    print("\nSending via Resend...")
    ok = send_welcome_verify_email(
        recipient,
        fake_verify_url,
        first_name=first_name,
    )

    if ok:
        print(f"\nOK  Resend accepted the request. Check {recipient} in ~30s.")
        print("    Verify in inbox: rendering, sender identity, link target,")
        print("    and that the plaintext fallback also reads cleanly.")
        return 0
    else:
        print("\nFAIL  Resend rejected the request. See logger.exception above.")
        print("      Common causes:")
        print("        - sender domain (RESEND_FROM_EMAIL) not verified in Resend")
        print("        - API key invalid / revoked")
        print("        - recipient blocked (e.g. previously bounced)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
