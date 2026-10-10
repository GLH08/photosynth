"""FastAPI 应用工厂：/api/health + 公开只读路由（M3）+ 管理路由挂载。"""
from __future__ import annotations

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from .auth import build_auth_router
from .config import APP_VERSION, Settings, load_settings
from .db import Base, make_engine, make_session_factory, session_scope
from .errors import register_error_handlers
from .routes import admin as admin_routes
from .routes import public as public_routes


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()  # 空 ADMIN_TOKEN / 弱 SESSION_SECRET → 拒绝启动
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)

    app = FastAPI(
        title="光合画廊 Photosynth API",
        version=APP_VERSION,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    register_error_handlers(app)

    def _get_session():
        yield from session_scope(session_factory)

    # 覆盖管理/公开路由的会话依赖
    app.dependency_overrides[admin_routes.get_session] = _get_session
    app.dependency_overrides[public_routes.get_session] = _get_session

    @app.get("/api/health", tags=["public"])
    def health(session: Session = Depends(_get_session)) -> dict:
        try:
            session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception:  # pragma: no cover
            db_status = "error"
        return {"status": "ok", "db": db_status, "version": APP_VERSION}

    app.include_router(build_auth_router())
    app.include_router(admin_routes.router)
    app.include_router(public_routes.router)
    return app


# 保证 alembic autogenerate 能看到全部表
_ = Base

app = create_app()
