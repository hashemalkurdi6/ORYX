"""Sanitizers for user-supplied free text that flows into AI prompts.

Call these on any profile field, search term, or chat message before it lands
inside a prompt string so a user can't smuggle "ignore previous instructions"
or a fake `system:` block into the model via their diet preferences.
"""
from __future__ import annotations

import re

_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(all|any|previous|prior)\s+(instructions|rules|prompts)"
    r"|system\s*prompt"
    r"|as\s+an\s+ai"
    r"|you\s+are\s+now"
    r"|role\s*:"
    r"|forget\s+everything)",
    re.IGNORECASE,
)


def safe_user_text(value, *, max_len: int = 200) -> str:
    """Defang user-supplied free-text for inclusion in AI prompts."""
    if value is None:
        return ""
    s = str(value).replace("\x00", "")
    # Strip newlines / control chars — multi-line input is the easiest way to
    # smuggle a fake `system:` block into a concatenated prompt.
    s = re.sub(r"[\r\n\t]+", " ", s)
    s = re.sub(r"[\x00-\x1f\x7f]", "", s)
    s = _INJECTION_PATTERNS.sub("[redacted]", s)
    s = s.strip()
    if len(s) > max_len:
        s = s[:max_len] + "…"
    return s


def safe_user_list(value, *, max_items: int = 30, max_len: int = 80) -> list[str]:
    if not value:
        return []
    items = value if isinstance(value, list) else [value]
    return [safe_user_text(v, max_len=max_len) for v in items[:max_items] if v]
