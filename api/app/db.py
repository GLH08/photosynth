"""SQLAlchemy 2.0 引擎与会话；SQLite 启用 WAL + 外键（DESIGN 1.2 / 6.1）。"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .textsort import natural_sort_key


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args)

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_conn, _record):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()
            # Build-F【1】：注册自然排序用户函数（每个连接都要注册）。
            # 「按名称」排序在 SQL 侧完成（ORDER BY / cursor 比较），
            # 实现与 cursor 键共用 app.textsort，保证两侧一致。
            dbapi_conn.create_function("natural_sort_key", 1, natural_sort_key)

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """FastAPI 依赖：每请求一个会话。"""
    session = factory()
    try:
        yield session
    finally:
        session.close()
