"""管理 API（DESIGN 3.2 全量，M2 范围）：works 登记/编辑/上下架/删除/列表 + albums/tags CRUD。

公开只读 API（GET /api/works 等）属 M3，本模块不实现。
批量导入 /api/admin/works/import 属 M3+（import_jobs 表已预留）。
"""
from __future__ import annotations

import base64
import json
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..errors import ApiError
from ..ids import nanoid, utcnow_iso
from ..models import Album, Tag, Work, WorkTag
from ..schemas import (
    AlbumCreate,
    AlbumUpdate,
    TagCreate,
    TagUpdate,
    WorkBatch,
    WorkCreate,
    WorkUpdate,
)
from ..serializers import album_to_dict, load_work, tag_to_dict_with_count, work_to_dict
from ..workquery import work_is_active

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    include_in_schema=False,  # 管理路由移出公开文档（DESIGN 3 章总原则）
    dependencies=[Depends(require_admin)],
)


def get_session() -> Session:  # pragma: no cover - 由 main.py 覆盖注入
    raise NotImplementedError


# ---------------------------------------------------------------- works

def _resolve_album(session: Session, slug: str | None) -> Album | None:
    if slug is None:
        return None
    album = session.scalar(select(Album).where(Album.slug == slug))
    if album is None:
        raise ApiError(404, "album_not_found", f"专辑不存在：{slug}")
    return album


def _get_or_create_tags(session: Session, slugs: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for slug in dict.fromkeys(slugs):  # 去重保序
        tag = session.scalar(select(Tag).where(Tag.slug == slug))
        if tag is None:  # 自动建缺失标签（DESIGN 3.2）
            name_conflict = session.scalar(select(Tag).where(Tag.name == slug))
            if name_conflict is not None:
                raise ApiError(409, "tag_conflict", f"标签名已被占用：{slug}")
            tag = Tag(id=nanoid("tg_"), name=slug, slug=slug, created_at=utcnow_iso())
            session.add(tag)
            session.flush()
        tags.append(tag)
    return tags


def _apply_tag_slugs(session: Session, work: Work, slugs: list[str]) -> None:
    work.tags.clear()
    session.flush()
    for tag in _get_or_create_tags(session, slugs):
        work.tags.append(tag)


@router.post("/works", status_code=status.HTTP_201_CREATED)
def create_work(payload: WorkCreate, session: Session = Depends(get_session)):
    # 幂等：(storage_backend, external_file_id) 已存在 → 200 skipped（坑 #6）
    if payload.external_file_id:
        existing = session.scalar(
            select(Work).where(
                Work.storage_backend == payload.storage_backend,
                Work.external_file_id == payload.external_file_id,
            )
        )
        if existing is not None:
            return JSONResponse(
                status_code=200,
                content={
                    "work": {"id": existing.id},
                    "skipped": True,
                    "reason": "external_file_id_exists",
                },
            )

    # TODO(M3+): width/height 缺省时服务端读外部文件头探测（PIL/ffprobe 流式读前 64KB，不落盘）
    now = utcnow_iso()
    album = _resolve_album(session, payload.album_slug)
    work = Work(
        id=nanoid("wk_"),
        type=payload.type,
        title=payload.title,
        description=payload.description,
        prompt=payload.prompt,
        negative_prompt=payload.negative_prompt,
        model_name=payload.model_name,
        model_version=payload.model_version,
        parameters=json.dumps(payload.parameters, ensure_ascii=False),
        reference_images=json.dumps(
            [r.model_dump() for r in payload.reference_images], ensure_ascii=False
        ),
        media_url=payload.media_url,
        thumb_url=payload.thumb_url or payload.media_url,
        poster_url=payload.poster_url,
        width=payload.width,
        height=payload.height,
        duration_seconds=payload.duration_seconds,
        storage_backend=payload.storage_backend,
        external_file_id=payload.external_file_id,
        content_hash=payload.content_hash,
        album_id=album.id if album else None,
        featured=1 if payload.featured else 0,
        sort_weight=payload.sort_weight,
        source_meta=(
            json.dumps(payload.source_meta, ensure_ascii=False)
            if payload.source_meta is not None
            else None
        ),
        created_at=now,
        published_at=now,  # 无发布流：新建即展示（published_at = created_at）
        updated_at=now,
    )
    session.add(work)
    session.flush()
    _apply_tag_slugs(session, work, payload.tag_slugs)
    session.commit()

    fresh = load_work(session, work.id)
    return JSONResponse(status_code=201, content={"work": work_to_dict(fresh, admin=True)})


@router.get("/works")
def list_works(
    session: Session = Depends(get_session),
    type: Literal["image", "video"] | None = None,
    q: str | None = None,
    cursor: str | None = None,
    limit: int = Query(default=24, ge=1, le=100),
):
    """管理列表（无发布流）：全量作品（不含回收站）+ 统计（DESIGN 3.2）。"""
    query = select(Work).where(work_is_active())
    if type:
        query = query.where(Work.type == type)
    if q:
        like = f"%{q}%"
        query = query.where(or_(Work.title.like(like), Work.prompt.like(like)))
    if cursor:
        try:
            padded = cursor + "=" * (-len(cursor) % 4)  # 生成时 rstrip 了 padding，解码前补回
            decoded = base64.urlsafe_b64decode(padded.encode()).decode()
            c_created, c_id = decoded.rsplit("|", 1)
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "invalid_cursor", "cursor 无效")
        query = query.where(
            or_(Work.created_at < c_created,
                and_(Work.created_at == c_created, Work.id < c_id))
        )
    query = query.order_by(Work.created_at.desc(), Work.id.desc()).limit(limit + 1)
    rows = list(session.scalars(query))
    has_more = len(rows) > limit
    rows = rows[:limit]

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = base64.urlsafe_b64encode(
            f"{last.created_at}|{last.id}".encode()
        ).decode().rstrip("=")

    def _count(*conds) -> int:
        return session.scalar(select(func.count(Work.id)).where(work_is_active(), *conds)) or 0

    stats = {
        "total": _count(),
        "images": _count(Work.type == "image"),
        "videos": _count(Work.type == "video"),
        "featured": _count(Work.featured == 1),
    }
    return {
        "items": [work_to_dict(load_work(session, w.id), admin=True) for w in rows],
        "next_cursor": next_cursor,
        "has_more": has_more,
        "stats": stats,
    }


def _get_work_or_404(session: Session, work_id: str) -> Work:
    work = load_work(session, work_id)
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    return work


@router.patch("/works/batch")
def batch_works(payload: WorkBatch, session: Session = Depends(get_session)):
    """批量作品操作（Build-H【2】）：{ids, op, ...} → {ok, failed}。

    逐条独立处理：单条失败（id 不存在 / 无操作权限）不影响其余，失败项带原因返回。
    精选/移入专辑/加标签仅作用于「未删除」作品；restore/purge 可作用于回收站内作品；
    trash 仅作用于未删除作品（已在回收站者计为失败，不重复处理）。
    专辑/标签等 op 级参数在循环前一次性解析，参数非法 → 整体 4xx（而非逐条失败）。
    """
    if payload.op == "move_album" and not payload.album_slug:
        raise ApiError(422, "validation_error", "move_album 需要 album_slug 参数")
    if payload.op == "add_tags" and not payload.tag_slugs:
        raise ApiError(422, "validation_error", "add_tags 需要 tag_slugs 参数")

    album = _resolve_album(session, payload.album_slug) if payload.op == "move_album" else None
    # 标签延迟到首个有效作品时再建，避免「全部 id 失败」也凭空造出空标签
    add_tags: list[Tag] | None = None

    include_deleted = payload.op in ("restore", "purge")
    now = utcnow_iso()
    ok = 0
    failed: list[dict[str, str]] = []

    # 去重保序，避免同一 id 被处理两次（幂等语义下二次效果不一致）
    for work_id in dict.fromkeys(payload.ids):
        work = load_work(session, work_id, include_deleted=include_deleted)
        # trash/featured/unfeatured/move_album/add_tags 只作用于未删除作品；
        # 已在回收站（或不存在）→ 失败。restore/purge 见 include_deleted。
        if work is None or (payload.op == "trash" and work.deleted_at is not None):
            failed.append({"id": work_id, "reason": "not_found"})
            continue

        if payload.op == "trash":
            work.deleted_at = now
            work.updated_at = now
        elif payload.op == "restore":
            work.deleted_at = None
            work.updated_at = now
        elif payload.op == "purge":
            session.delete(work)  # work_tags 经 FK ON DELETE CASCADE 解除
        elif payload.op == "featured":
            work.featured = 1
            work.updated_at = now
        elif payload.op == "unfeatured":
            work.featured = 0
            work.updated_at = now
        elif payload.op == "move_album":
            work.album_id = album.id if album else None
            work.updated_at = now
        elif payload.op == "add_tags":
            if add_tags is None:
                add_tags = _get_or_create_tags(session, payload.tag_slugs)
            existing = {t.id for t in work.tags}
            for tag in add_tags:
                if tag.id not in existing:  # 追加不覆盖；已有则跳过
                    work.tags.append(tag)
            work.updated_at = now
        ok += 1

    session.commit()
    return {"ok": ok, "failed": failed}


@router.patch("/works/{work_id}")
def update_work(work_id: str, payload: WorkUpdate, session: Session = Depends(get_session)):
    work = _get_work_or_404(session, work_id)
    data = payload.model_dump(exclude_unset=True)

    if "parameters" in data:
        work.parameters = json.dumps(data.pop("parameters"), ensure_ascii=False)
    if "reference_images" in data:
        refs = data.pop("reference_images")
        work.reference_images = json.dumps(refs, ensure_ascii=False)
    if "source_meta" in data:
        meta = data.pop("source_meta")
        work.source_meta = json.dumps(meta, ensure_ascii=False) if meta is not None else None
    if "tag_slugs" in data:
        _apply_tag_slugs(session, work, data.pop("tag_slugs"))
    if "album_slug" in data:
        slug = data.pop("album_slug")
        album = _resolve_album(session, slug)
        work.album_id = album.id if album else None
    if "featured" in data:
        data["featured"] = 1 if data["featured"] else 0

    for field, value in data.items():
        setattr(work, field, value)

    # 视频完整性（与 DB CHECK 对齐，先行给出可读 422 而非 IntegrityError）
    if work.type == "video" and (work.poster_url is None or work.duration_seconds is None):
        raise ApiError(422, "validation_error", "type=video 时 poster_url 与 duration_seconds 必填")
    if work.type == "image" and (work.poster_url is not None or work.duration_seconds is not None):
        raise ApiError(422, "validation_error", "type=image 时不得携带 poster_url / duration_seconds")

    work.updated_at = utcnow_iso()
    session.commit()
    return {"work": work_to_dict(_get_work_or_404(session, work_id), admin=True)}


@router.delete("/works/{work_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work(
    work_id: str,
    confirm: str | None = Query(default=None),
    session: Session = Depends(get_session),
):
    """软删除（移入回收站，Build-G）：置 deleted_at，不物理删除数据库行。

    外部存储文件一律不删（软删除纪律，DESIGN 2.6）；可在 /api/admin/trash 恢复，
    或经 DELETE /works/{id}/purge 物理清理。
    """
    if confirm != "true":
        raise ApiError(400, "confirm_required", "删除需显式 ?confirm=true")
    work = _get_work_or_404(session, work_id)  # 已在回收站者不重复处理 → 404
    now = utcnow_iso()
    work.deleted_at = now
    work.updated_at = now
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/trash")
def list_trash(
    session: Session = Depends(get_session),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """回收站：仅已软删除作品，按 deleted_at 倒序（最近删除在前）+ offset 分页。

    total 供前端回收站入口 badge 计数（limit=1 即可取总数）。
    """
    deleted = Work.deleted_at.is_not(None)
    total = session.scalar(select(func.count(Work.id)).where(deleted)) or 0
    rows = list(
        session.scalars(
            select(Work)
            .where(deleted)
            .order_by(Work.deleted_at.desc(), Work.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return {
        "items": [
            work_to_dict(load_work(session, w.id, include_deleted=True), admin=True)
            for w in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


@router.post("/works/{work_id}/restore")
def restore_work(work_id: str, session: Session = Depends(get_session)):
    """从回收站恢复：deleted_at 置 NULL（幂等）；不存在 → 404。"""
    work = load_work(session, work_id, include_deleted=True)
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    work.deleted_at = None
    work.updated_at = utcnow_iso()
    session.commit()
    return {"work": work_to_dict(load_work(session, work_id), admin=True)}


@router.delete("/works/{work_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_work(work_id: str, session: Session = Depends(get_session)):
    """彻底删除（物理删除数据库行，不可恢复）；不存在 → 404。

    外部存储文件仍不删（服务端只清理数据库记录，DESIGN 2.6）。
    """
    work = load_work(session, work_id, include_deleted=True)
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    session.delete(work)  # work_tags 经 FK ON DELETE CASCADE 解除
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- albums

@router.get("/albums")
def list_albums(session: Session = Depends(get_session)):
    albums = session.scalars(
        select(Album).order_by(Album.sort_weight.desc(), Album.created_at.asc())
    ).all()
    return {"items": [album_to_dict(a, session) for a in albums]}


@router.post("/albums", status_code=status.HTTP_201_CREATED)
def create_album(payload: AlbumCreate, session: Session = Depends(get_session)):
    if session.scalar(select(Album).where(Album.slug == payload.slug)):
        raise ApiError(409, "slug_conflict", f"专辑 slug 已存在：{payload.slug}")
    now = utcnow_iso()
    album = Album(
        id=nanoid("al_"),
        slug=payload.slug,
        name=payload.name,
        description=payload.description,
        cover_url=payload.cover_url,
        kind=payload.kind,
        sort_weight=payload.sort_weight,
        external_ref=payload.external_ref,
        created_at=now,
        updated_at=now,
    )
    session.add(album)
    session.commit()
    return JSONResponse(status_code=201, content=album_to_dict(album, session))


def _get_album_or_404(session: Session, album_id: str) -> Album:
    album = session.get(Album, album_id)
    if album is None:
        raise ApiError(404, "album_not_found", "专辑不存在")
    return album


@router.patch("/albums/{album_id}")
def update_album(album_id: str, payload: AlbumUpdate, session: Session = Depends(get_session)):
    album = _get_album_or_404(session, album_id)
    data = payload.model_dump(exclude_unset=True)
    new_slug = data.get("slug")
    if new_slug and new_slug != album.slug:
        if session.scalar(select(Album).where(Album.slug == new_slug)):
            raise ApiError(409, "slug_conflict", f"专辑 slug 已存在：{new_slug}")
    for field, value in data.items():
        setattr(album, field, value)
    album.updated_at = utcnow_iso()
    session.commit()
    return album_to_dict(album, session)


@router.delete("/albums/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_album(album_id: str, session: Session = Depends(get_session)):
    album = _get_album_or_404(session, album_id)
    session.delete(album)  # works.album_id 经 FK ON DELETE SET NULL 解除关联
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- tags

@router.get("/tags")
def list_tags(session: Session = Depends(get_session)):
    tags = session.scalars(select(Tag).order_by(Tag.name)).all()
    return {"items": [tag_to_dict_with_count(t, session) for t in tags]}


@router.post("/tags", status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreate, session: Session = Depends(get_session)):
    if session.scalar(select(Tag).where(Tag.slug == payload.slug)):
        raise ApiError(409, "slug_conflict", f"标签 slug 已存在：{payload.slug}")
    if session.scalar(select(Tag).where(Tag.name == payload.name)):
        raise ApiError(409, "name_conflict", f"标签名已存在：{payload.name}")
    tag = Tag(id=nanoid("tg_"), name=payload.name, slug=payload.slug, created_at=utcnow_iso())
    session.add(tag)
    session.commit()
    return JSONResponse(status_code=201, content=tag_to_dict_with_count(tag, session))


@router.patch("/tags/{tag_id}")
def update_tag(tag_id: str, payload: TagUpdate, session: Session = Depends(get_session)):
    tag = session.get(Tag, tag_id)
    if tag is None:
        raise ApiError(404, "tag_not_found", "标签不存在")
    data = payload.model_dump(exclude_unset=True)
    for field in ("slug", "name"):
        value = data.get(field)
        if value and value != getattr(tag, field):
            if session.scalar(select(Tag).where(getattr(Tag, field) == value, Tag.id != tag.id)):
                code = "slug_conflict" if field == "slug" else "name_conflict"
                raise ApiError(409, code, f"标签 {field} 已存在：{value}")
    for field, value in data.items():
        setattr(tag, field, value)
    session.commit()
    return tag_to_dict_with_count(tag, session)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: str, session: Session = Depends(get_session)):
    tag = session.get(Tag, tag_id)
    if tag is None:
        raise ApiError(404, "tag_not_found", "标签不存在")
    # 删除标签自动解除关联（work_tags ON DELETE CASCADE）
    session.delete(tag)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
