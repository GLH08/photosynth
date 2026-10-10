"""M1 健康检查 + M2 管理鉴权用例。"""
from __future__ import annotations

import pytest

from app.config import Settings, validate_settings
from tests.conftest import ADMIN_TOKEN, BEARER


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert "version" in body


def test_login_success_sets_signed_cookie(client):
    r = client.post("/api/admin/login", json={"token": ADMIN_TOKEN})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    set_cookie = r.headers.get("set-cookie", "")
    assert "gal_session=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()
    assert "Max-Age=604800" in set_cookie
    # 登录后可访问管理接口
    assert client.get("/api/admin/works").status_code == 200


def test_login_wrong_token_401(client):
    r = client.post("/api/admin/login", json={"token": "wrong-token"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_token"


def test_admin_requires_auth_401(client):
    r = client.get("/api/admin/works")
    assert r.status_code == 401
    body = r.json()
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["message"] == "请先登录"


def test_bearer_token_allows_access(client):
    r = client.get("/api/admin/works", headers=BEARER)
    assert r.status_code == 200
    # 伪造 bearer 仍 401
    r2 = client.get("/api/admin/works", headers={"Authorization": "Bearer nope"})
    assert r2.status_code == 401


def test_logout_clears_cookie(admin):
    r = admin.post("/api/admin/logout")
    assert r.status_code == 200
    # 清 Cookie 后（值为空/过期）无法再访问
    admin.cookies.clear()
    assert admin.get("/api/admin/works").status_code == 401


def test_empty_admin_token_refuses_startup():
    with pytest.raises(RuntimeError):
        validate_settings(Settings(admin_token="", session_secret="x" * 32))
    with pytest.raises(RuntimeError):
        validate_settings(Settings(admin_token="changeme", session_secret="x" * 32))
    with pytest.raises(RuntimeError):
        validate_settings(Settings(admin_token="t0k", session_secret="too-short"))
    # 合法配置不抛
    validate_settings(Settings(admin_token="strong-token", session_secret="x" * 32))
