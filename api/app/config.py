"""应用配置：全部来自环境变量；密钥纪律照搬 DESIGN 1.2 / 6.3。

- ADMIN_TOKEN 空值或示例值 → 拒绝启动（抛 RuntimeError，uvicorn 起不来）。
- SESSION_SECRET 必须 ≥32 字符。
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

APP_VERSION = "0.3.0"  # M3

# 示例值黑名单（B 的密钥纪律）
_TOKEN_BLOCKLIST = {"", "changeme", "change-me", "admin", "secret", "your-token-here"}

DEFAULT_DATABASE_URL = "sqlite:////data/gallery.db"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    admin_token: str
    session_secret: str
    database_url: str = DEFAULT_DATABASE_URL
    seed_demo: bool = True
    public_base_url: str = ""
    cookie_secure: bool = False  # 非 HTTPS 部署不加 Secure，由外层反代决定（DESIGN 3.2）
    cookie_name: str = "gal_session"
    cookie_max_age: int = 604800  # 7 天


def validate_settings(s: Settings) -> None:
    """空 token / 示例值 / 弱密钥 → 拒绝启动。"""
    if s.admin_token.strip().lower() in _TOKEN_BLOCKLIST:
        raise RuntimeError(
            "ADMIN_TOKEN 未设置或为示例值，拒绝启动。请在 .env 中配置强随机令牌。"
        )
    if len(s.admin_token) < 16:
        raise RuntimeError("ADMIN_TOKEN 必须 ≥16 字符（建议 32+ 位随机值），拒绝启动。")
    if len(s.session_secret) < 32:
        raise RuntimeError("SESSION_SECRET 必须 ≥32 字符，拒绝启动。")


def load_settings() -> Settings:
    s = Settings(
        admin_token=os.environ.get("ADMIN_TOKEN", ""),
        session_secret=os.environ.get("SESSION_SECRET", ""),
        database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
        seed_demo=_env_bool("SEED_DEMO", True),
        public_base_url=os.environ.get("PUBLIC_BASE_URL", ""),
        cookie_secure=_env_bool("COOKIE_SECURE", False),
    )
    validate_settings(s)
    return s
