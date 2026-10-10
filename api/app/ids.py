"""nanoid 短 ID（DESIGN 2 章约定：TEXT 主键，适合 /works/[id] 分享 URL）与 UTC 时间。"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_ID_LEN = 10


def nanoid(prefix: str = "") -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(_ID_LEN))
    return f"{prefix}{body}" if prefix else body


def utcnow_iso() -> str:
    """UTC ISO8601 TEXT，如 2026-10-10T08:30:00Z。"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
