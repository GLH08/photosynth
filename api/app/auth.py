"""管理端鉴权（DESIGN 1.2 / 3.2）：

- POST /api/admin/login：ADMIN_TOKEN 校验（hmac.compare_digest，constant-time）
  → itsdangerous 签名 Cookie（HttpOnly / SameSite=Lax / 7 天）。
- 管理路由同时支持 Authorization: Bearer <ADMIN_TOKEN>（脚本/CI）。
- 登录 IP 限速 60s/10 次（沿用 A）。
"""
from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque

from itsdangerous import BadSignature, URLSafeTimedSerializer
from starlette.requests import Request

from .config import Settings
from .errors import ApiError
from .schemas import LoginRequest
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

_SALT = "photosynth-gal-session"
_RATE_WINDOW = 60.0
_RATE_MAX = 10

# 进程内限速表（单进程部署足够；重启清零可接受）
_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt=_SALT)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def _rate_limit(key: str) -> None:
    now = time.monotonic()
    dq = _login_attempts[key]
    while dq and now - dq[0] > _RATE_WINDOW:
        dq.popleft()
    if len(dq) >= _RATE_MAX:
        raise ApiError(429, "rate_limited", "尝试次数过多，请 60 秒后再试")
    dq.append(now)


def require_admin(request: Request) -> None:
    """管理路由统一依赖：Bearer 或签名 Cookie，二者皆无/无效 → 401。"""
    settings: Settings = request.app.state.settings

    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        if hmac.compare_digest(token, settings.admin_token):
            return

    cookie = request.cookies.get(settings.cookie_name)
    if cookie:
        try:
            _serializer(settings).loads(cookie, max_age=settings.cookie_max_age)
            return
        except BadSignature:
            pass

    raise ApiError(401, "unauthorized", "请先登录")


class LoginResponse(BaseModel):
    ok: bool = True


def build_auth_router() -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["admin"], include_in_schema=False)

    @router.post("/login", response_model=LoginResponse)
    def login(payload: LoginRequest, response: Response, request: Request,
              settings: Settings = Depends(get_settings)) -> LoginResponse:
        client_ip = request.client.host if request.client else "unknown"
        _rate_limit(client_ip)
        if not hmac.compare_digest(payload.token, settings.admin_token):
            raise ApiError(401, "invalid_token", "令牌无效")
        signed = _serializer(settings).dumps({"sub": "admin"})
        response.set_cookie(
            key=settings.cookie_name,
            value=signed,
            max_age=settings.cookie_max_age,
            httponly=True,
            samesite="lax",
            secure=settings.cookie_secure,
            path="/",
        )
        return LoginResponse(ok=True)

    @router.post("/logout")
    def logout(response: Response, settings: Settings = Depends(get_settings)) -> dict:
        # 无状态签名 Cookie：清 Cookie 即可，无需服务端吊销
        response.delete_cookie(key=settings.cookie_name, path="/")
        return {"ok": True}

    return router
