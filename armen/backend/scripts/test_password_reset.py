"""End-to-end smoke test for the password-reset email pipeline.

Hits POST /auth/forgot-password against the locally running backend, which
exercises the real production code path: rate limit, user lookup, real JWT
token mint, real Resend email send. The previous version of this script
constructed a placeholder URL with a literal "test.token.signature" string
and skipped the token-generation pipeline entirely — a real bug that
masked failures.

Invocation:
    # Backend must be running locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000

    # Then in another terminal:
    cd armen/backend
    .venv\\Scripts\\activate          (Windows)
    source .venv/bin/activate         (macOS/Linux)
    python scripts/test_password_reset.py <recipient@example.com> [--base-url http://127.0.0.1:8000]

What it checks:
1. Backend is reachable at the given base URL.
2. POST /auth/forgot-password returns 202 (the always-202 anti-enumeration response).
3. In dev mode (ENV != "prod"/"production"), the endpoint echoes
   `debug_reset_token` in the response body — proves a real user matched
   the email AND a real JWT was minted AND the send code path executed.
4. The echoed token has the shape of a real JWT (3 dot-separated segments,
   not a placeholder string).

What it does NOT check:
- Whether the email actually arrived in the inbox (Resend dashboard does
  that — the script prints the inbox URL pattern).
- The deep-link tap behavior (manual phone verification).

Failure paths surfaced explicitly:
- No user with that email exists in the DB → endpoint silently 202s with
  no debug_reset_token. Script flags it: "sign up that email first."
- ENV is prod → debug_reset_token suppressed by design. Script notes it
  can't verify token shape but the send still happened.
- Backend not running → connection error. Script suggests the uvicorn
  command.
- Rate limited (5 / 10min per IP) → 429. Script flags it.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-test password reset via the real /auth/forgot-password endpoint"
    )
    parser.add_argument(
        "recipient",
        help="Email address to send the reset to. Must match an existing user in the DB.",
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Backend base URL (default: http://127.0.0.1:8000)",
    )
    args = parser.parse_args()

    print("=" * 64)
    print("ORYX password reset smoke test (via real /auth/forgot-password)")
    print("=" * 64)
    print(f"  base url                    : {args.base_url}")
    print(f"  recipient                   : {args.recipient}")
    print(f"  ENV                         : {settings.ENV}")
    print(f"  PASSWORD_RESET_URL_BASE     : {settings.PASSWORD_RESET_URL_BASE}")
    print(f"  RESEND_FROM_EMAIL           : {settings.RESEND_FROM_EMAIL}")
    print(f"  RESEND_API_KEY configured   : {bool(settings.RESEND_API_KEY)}")
    print("=" * 64)

    # HTTP client: prefer httpx (FastAPI's default), fall back to requests.
    try:
        import httpx
        client_kind = "httpx"
    except ImportError:
        try:
            import requests  # type: ignore
            httpx = None  # type: ignore
            client_kind = "requests"
        except ImportError:
            print("[FAIL] Neither httpx nor requests installed in the venv.")
            print("       Install one: pip install httpx")
            return 2
    print(f"  HTTP client                 : {client_kind}")
    print()

    url = f"{args.base_url.rstrip('/')}/auth/forgot-password"
    payload = {"email": args.recipient}
    print(f"POST {url}")
    print(f"     payload: {payload}")
    print()

    try:
        if client_kind == "httpx":
            with httpx.Client(timeout=30.0) as c:
                resp = c.post(url, json=payload)
        else:
            resp = requests.post(url, json=payload, timeout=30.0)
    except Exception as e:
        print(f"[FAIL] request failed: {type(e).__name__}: {e}")
        print("       → Is the backend running?")
        print("       → Try: cd armen/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000")
        return 2

    print(f"  status: {resp.status_code}")

    try:
        body = resp.json()
    except Exception:
        print(f"[FAIL] non-JSON response body (first 500 chars): {resp.text[:500]}")
        return 2

    print(f"  body  : {body}")
    print()

    if resp.status_code == 429:
        print("[FAIL] Rate limited. The endpoint allows 5 requests / 10 min per IP.")
        print("       Wait 10 minutes and re-run, or restart the backend to clear the in-memory limit.")
        return 2

    if resp.status_code != 202:
        print(f"[FAIL] Expected 202, got {resp.status_code}.")
        print("       The endpoint always returns 202 to avoid email enumeration.")
        print("       A non-202 status indicates a server bug or invalid payload.")
        return 2

    # 202 received. Now check whether a real send actually happened.
    debug_token = body.get("debug_reset_token") if isinstance(body, dict) else None

    is_prod = settings.ENV.lower() in ("prod", "production")
    if not debug_token:
        if is_prod:
            print("[INFO] ENV is prod — debug_reset_token is suppressed by design.")
            print("       Cannot verify token shape from script. Check the inbox manually.")
            print("       If the email arrived, the send worked. If not, check Resend dashboard.")
            return 0
        print("[FAIL] No debug_reset_token in the response and ENV is not prod.")
        print("       Most likely cause: no user exists in the DB with email")
        print(f"       {args.recipient!r}. The endpoint silently returns 202 in")
        print("       that case (anti-enumeration). No email was sent.")
        print()
        print("       To fix: sign up that email via the mobile app first, then re-run.")
        return 2

    # Verify the token actually looks like a JWT.
    parts = debug_token.split(".")
    if len(parts) != 3:
        print(f"[FAIL] Token doesn't have JWT shape — expected 3 dot-separated segments, got {len(parts)}.")
        print(f"       token (first 60 chars): {debug_token[:60]}")
        return 2
    seg_lens = [len(p) for p in parts]
    if any(seg < 8 for seg in seg_lens):
        print(f"[FAIL] Token segments too short to be a real JWT: lengths {seg_lens}")
        print(f"       token: {debug_token}")
        return 2

    masked = f"{parts[0][:8]}...{parts[2][-8:]}"
    print(f"[ok] Real JWT minted: shape OK ({seg_lens[0]}.{seg_lens[1]}.{seg_lens[2]}, total {len(debug_token)} chars), preview: {masked}")
    print(f"[ok] Real password reset email sent via Resend to {args.recipient}")
    print()
    print(f"     Email link will be: {settings.PASSWORD_RESET_URL_BASE}?token=<the JWT above>")
    print()
    print("Next steps (manual verification):")
    print(f"  1. Check {args.recipient} inbox in ~30 seconds")
    print("  2. Confirm sender, subject, copy")
    print(f"  3. Confirm URL starts with {settings.PASSWORD_RESET_URL_BASE!r}")
    print("  4. Tap the link from a device with ORYX installed")
    print("  5. App opens to reset-password screen with token pre-populated")
    print("  6. Enter new password, submit, confirm auto-login")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
