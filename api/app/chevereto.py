"""Chevereto 变体 URL 派生（Build-M1，与 web/lib/chevereto.ts 同规则）。

Chevereto 为每张图片自动生成 `.th`（thumb）与 `.md`（medium）变体，
规则是在最终扩展名前插入后缀。仅在「确定」时派生，其余一律原样返回：
非 Chevereto 主机、已带变体、非图片扩展名（.mp4 等）、无扩展名、非法 URL。
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit

IMAGE_EXT = frozenset({"png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"})
_VARIANT_RE = re.compile(r"\.(?:th|md)\.(?:png|jpe?g|webp|gif|avif|bmp)$", re.IGNORECASE)


def chevereto_variant(url: str | None, variant: str) -> str | None:
    """返回 `url` 的 `variant`（"th"/"md"）变体地址；不确定时原样返回。"""
    if not url:
        return url
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    if "chevereto" not in (parts.hostname or "").lower():
        return url

    path = parts.path
    slash = path.rfind("/")
    name = path[slash + 1:]
    if _VARIANT_RE.search(name):
        return url  # 已是变体
    dot = name.rfind(".")
    if dot <= 0:
        return url  # 无扩展名
    ext = name[dot + 1:]
    if ext.lower() not in IMAGE_EXT:
        return url  # 非图片（.mp4 等）
    base = name[:dot]
    if not base:
        return url

    new_path = f"{path[:slash + 1]}{base}.{variant}.{ext}"
    return urlunsplit((parts.scheme, parts.netloc, new_path, parts.query, parts.fragment))
