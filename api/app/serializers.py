"""ORM → 响应 dict 序列化（JSON TEXT 字段还原为对象；结构对齐 DESIGN 3.1）。"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .models import Album, Tag, Work


def _json_loads(raw: str | None, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def tag_to_dict(tag: Tag) -> dict:
    return {"slug": tag.slug, "name": tag.name}


def album_brief(album: Album | None) -> dict | None:
    if album is None:
        return None
    return {"slug": album.slug, "name": album.name}


def work_to_dict(work: Work, *, admin: bool = False, detail: bool = False) -> dict:
    d: dict[str, Any] = {
        "id": work.id,
        "type": work.type,
        "title": work.title,
        "description": work.description,
        "prompt": work.prompt,
        "model_name": work.model_name,
        "width": work.width,
        "height": work.height,
        "media_url": work.media_url,
        "thumb_url": work.thumb_url,
        "poster_url": work.poster_url,
        "duration_seconds": work.duration_seconds,
        "featured": bool(work.featured),
        "album": album_brief(work.album),
        "tags": [tag_to_dict(t) for t in work.tags],
        "published_at": work.published_at,
    }
    if detail:
        # 公开详情（DESIGN 3.1）：比列表多出以下字段，不含 external_file_id/content_hash 等内部字段
        d.update(
            {
                "negative_prompt": work.negative_prompt,
                "model_version": work.model_version,
                "parameters": _json_loads(work.parameters, {}),
                "reference_images": _json_loads(work.reference_images, []),
                "storage_backend": work.storage_backend,
                "visibility": work.visibility,
                "source_meta": _json_loads(work.source_meta, None),
                "created_at": work.created_at,
                "updated_at": work.updated_at,
            }
        )
    if admin:
        d.update(
            {
                "negative_prompt": work.negative_prompt,
                "model_version": work.model_version,
                "parameters": _json_loads(work.parameters, {}),
                "reference_images": _json_loads(work.reference_images, []),
                "storage_backend": work.storage_backend,
                "external_file_id": work.external_file_id,
                "content_hash": work.content_hash,
                "visibility": work.visibility,
                "sort_weight": work.sort_weight,
                "source_meta": _json_loads(work.source_meta, None),
                "created_at": work.created_at,
                "updated_at": work.updated_at,
            }
        )
    return d


def load_work(session: Session, work_id: str) -> Work:
    """带 album/tags 预加载取作品；不存在 → 由调用方抛 404。"""
    work = session.scalar(
        select(Work).where(Work.id == work_id).options(selectinload(Work.tags))
    )
    return work  # type: ignore[return-value]


def album_to_dict(album: Album, session: Session, *, public_only: bool = False) -> dict:
    count_q = select(func.count(Work.id)).where(Work.album_id == album.id)
    if public_only:
        count_q = count_q.where(Work.visibility == "public")
    work_count = session.scalar(count_q) or 0
    return {
        "id": album.id,
        "slug": album.slug,
        "name": album.name,
        "description": album.description,
        "cover_url": album.cover_url,
        "kind": album.kind,
        "sort_weight": album.sort_weight,
        "external_ref": album.external_ref,
        "work_count": work_count,
        "created_at": album.created_at,
        "updated_at": album.updated_at,
    }


def tag_to_dict_with_count(tag: Tag, session: Session) -> dict:
    count = session.scalar(
        select(func.count(Work.id))
        .join(Work.tags)
        .where(Tag.id == tag.id)
    ) or 0
    return {"id": tag.id, "slug": tag.slug, "name": tag.name, "count": count}
