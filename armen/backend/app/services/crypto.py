"""Application-layer encryption for secrets stored in the DB (OAuth tokens).

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package, which
is already pulled in transitively by `python-jose[cryptography]`.

Exposes a SQLAlchemy `TypeDecorator` (`EncryptedString`) so columns that hold
secrets transparently encrypt on write and decrypt on read. Legacy rows that
were written before encryption was turned on are tolerated — on read we first
try to decrypt; if that fails we assume the value is legacy plaintext and
return it verbatim. The next write re-encrypts it.
"""
from __future__ import annotations

import logging

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.config import settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet | None:
    global _fernet
    if _fernet is not None:
        return _fernet
    key = settings.TOKEN_ENCRYPTION_KEY.strip()
    if not key:
        env = (settings.ENV or "").lower()
        if env in {"prod", "production"}:
            raise RuntimeError(
                "TOKEN_ENCRYPTION_KEY is required in production. "
                "Generate one: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        logger.warning(
            "TOKEN_ENCRYPTION_KEY is not set — OAuth tokens will be stored in plaintext. "
            "Set this before going to production."
        )
        return None
    try:
        _fernet = Fernet(key.encode())
    except Exception as exc:
        raise RuntimeError(f"TOKEN_ENCRYPTION_KEY is malformed: {exc}") from exc
    return _fernet


def encrypt_str(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    f = _get_fernet()
    if f is None:
        return value
    return f.encrypt(value.encode()).decode()


def decrypt_str(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    f = _get_fernet()
    if f is None:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except InvalidToken:
        # Legacy plaintext row written before encryption was enabled.
        return value


class EncryptedString(TypeDecorator):
    """String column that encrypts at rest with Fernet."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_str(value)

    def process_result_value(self, value, dialect):
        return decrypt_str(value)
