"""统一错误响应（DESIGN 3 章）：{"error": {"code": ..., "message": ...}}。"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

# 字段名 → 机器可读短码（URL 三件套强制 HTTPS，坑 #10）
_URL_FIELDS = {"media_url", "thumb_url", "poster_url", "url"}


class ApiError(Exception):
    """业务错误：状态码 + 短码 + 中文 message。"""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def _validation_code(exc: RequestValidationError) -> str:
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        field = loc[-1] if loc else ""
        if field in _URL_FIELDS:
            return "invalid_media_url"
    return "validation_error"


def _validation_message(exc: RequestValidationError) -> str:
    parts = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        field = ".".join(loc) if loc else "?"
        msg = str(err.get("msg", ""))
        # ValueError 自定义中文消息优先透出
        ctx = err.get("ctx") or {}
        if isinstance(ctx.get("error"), ValueError) and str(ctx["error"]):
            msg = str(ctx["error"])
        parts.append(f"{field}: {msg}")
    return "；".join(parts)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_error_body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_body(_validation_code(exc), _validation_message(exc)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code_map = {404: "not_found", 405: "method_not_allowed", 401: "unauthorized"}
        code = code_map.get(exc.status_code, "http_error")
        return JSONResponse(status_code=exc.status_code, content=_error_body(code, str(exc.detail)))
