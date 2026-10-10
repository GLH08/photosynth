"""公开只读 API（DESIGN 3.1 全量，M3 范围，无发布流：全量作品均展示）。

- cursor 分页：base64(created_at|id)，翻页期间新增数据不重不漏。
  排序键必须用非空 created_at（published_at 可空：NULL 行在比较中恒为
  NULL，会被 cursor 条件静默过滤导致提前终止，见 Build-E【1】）。
- 全部 JSON 响应带 Cache-Control: public, max-age=60 + ETag（内容哈希），If-None-Match → 304。
- /api/media/{id} → 302 重定向到外部直链（存储透明切换，前端零改动）。
"""
from __future__ import annotations

import base64
import hashlib
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy import ColumnElement, Float, and_, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..errors import ApiError
from ..models import Album, Tag, Work, WorkTag
from ..serializers import load_work, work_to_dict

router = APIRouter(prefix="/api", tags=["public"])

CACHE_CONTROL = "public, max-age=60"

SortOrder = Literal["latest", "oldest"]
# Build-E【4】：真实比例值；旧 portrait/square/landscape 保留（超集兼容，老分享链接仍可用）
RatioBucket = Literal[
    "portrait", "square", "landscape",
    "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5",
]
MediaType = Literal["image", "video"]
MediaKind = Literal["original", "thumb", "poster"]


def get_session() -> Session:  # pragma: no cover - 由 main.py 覆盖注入
    raise NotImplementedError


# ---------------------------------------------------------------- 缓存与 ETag

def cached_json(request: Request, payload, *, status_code: int = 200) -> Response:
    resp = JSONResponse(content=payload, status_code=status_code)
    etag = '"' + hashlib.sha1(resp.body).hexdigest()[:32] + '"'
    resp.headers["Cache-Control"] = CACHE_CONTROL
    resp.headers["ETag"] = etag
    inm = request.headers.get("if-none-match")
    if inm:
        candidates = {t.strip().removeprefix("W/") for t in inm.split(",")}
        if etag in candidates or "*" in candidates:
            return Response(
                status_code=304,
                headers={"Cache-Control": CACHE_CONTROL, "ETag": etag},
            )
    return resp


# ---------------------------------------------------------------- cursor

def encode_cursor(work: Work) -> str:
    return (
        base64.urlsafe_b64encode(f"{work.created_at}|{work.id}".encode())
        .decode()
        .rstrip("=")
    )


def decode_cursor(cursor: str) -> tuple[str, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)  # 生成时 rstrip 了 padding
        decoded = base64.urlsafe_b64decode(padded.encode()).decode()
        pub, work_id = decoded.rsplit("|", 1)
    except Exception:
        raise ApiError(400, "invalid_cursor", "cursor 无效")
    if not pub or not work_id:
        raise ApiError(400, "invalid_cursor", "cursor 无效")
    return pub, work_id


# ---------------------------------------------------------------- 筛选

# Build-E【4】：真实比例桶的目标宽高比（旧 portrait/square/landscape 走上面的分支）
_RATIO_TARGETS: dict[str, float] = {
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "1:1": 1.0,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "3:2": 3 / 2,
    "2:3": 2 / 3,
    "4:5": 4 / 5,
}


def _ratio_condition(ratio: RatioBucket) -> ColumnElement[bool]:
    # DESIGN 3.1：h > w*1.05 竖 / 差值内方 / w > h*1.05 横（旧桶保留兼容）
    if ratio == "portrait":
        return Work.height > Work.width * 1.05
    if ratio == "landscape":
        return Work.width > Work.height * 1.05
    if ratio == "square":
        return and_(
            Work.height <= Work.width * 1.05,
            Work.width <= Work.height * 1.05,
        )
    # Build-E【4】：真实比例桶——宽高比与目标值相对误差 ≤3% 即命中
    target = _RATIO_TARGETS[ratio]
    actual = cast(Work.width, Float) / cast(Work.height, Float)
    return func.abs(actual - target) <= target * 0.03


def _filter_conditions(
    *,
    type: MediaType | None,
    album: str | None,
    tag: list[str],
    ratio: RatioBucket | None,
    featured: bool | None,
    q: str | None,
) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = []
    if type:
        conds.append(Work.type == type)
    if album:
        conds.append(Work.album.has(Album.slug == album))
    for slug in dict.fromkeys(tag):  # 多值 AND 语义
        conds.append(Work.tags.any(Tag.slug == slug))
    if ratio:
        conds.append(_ratio_condition(ratio))
    if featured is not None:
        conds.append(Work.featured == (1 if featured else 0))
    if q:
        like = f"%{q}%"
        conds.append(or_(Work.title.like(like), Work.prompt.like(like)))
    return conds


def _order_and_cursor(
    sort: SortOrder, cursor: str | None
) -> tuple[list, ColumnElement[bool] | None]:
    descending = sort != "oldest"
    cursor_cond = None
    if cursor:
        c_created, c_id = decode_cursor(cursor)
        if descending:
            cursor_cond = or_(
                Work.created_at < c_created,
                and_(Work.created_at == c_created, Work.id < c_id),
            )
        else:
            cursor_cond = or_(
                Work.created_at > c_created,
                and_(Work.created_at == c_created, Work.id > c_id),
            )
    if descending:
        order = [Work.created_at.desc(), Work.id.desc()]
    else:
        order = [Work.created_at.asc(), Work.id.asc()]
    return order, cursor_cond


def _query_works_page(
    session: Session,
    conds: list[ColumnElement[bool]],
    *,
    sort: SortOrder,
    cursor: str | None,
    limit: int,
) -> tuple[list[Work], int, str | None]:
    """返回 (rows, total, next_cursor)；rows 带 album/tags 预加载。"""
    order, cursor_cond = _order_and_cursor(sort, cursor)
    where = list(conds)
    if cursor_cond is not None:
        where.append(cursor_cond)

    rows = list(
        session.scalars(
            select(Work)
            .where(*where)
            .options(selectinload(Work.album), selectinload(Work.tags))
            .order_by(*order)
            .limit(limit + 1)
        )
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    total = session.scalar(select(func.count(Work.id)).where(*conds)) or 0
    next_cursor = encode_cursor(rows[-1]) if has_more and rows else None
    return rows, total, next_cursor


def _works_page_payload(
    session: Session,
    conds: list[ColumnElement[bool]],
    *,
    sort: SortOrder,
    cursor: str | None,
    limit: int,
) -> dict:
    rows, total, next_cursor = _query_works_page(
        session, conds, sort=sort, cursor=cursor, limit=limit
    )
    return {
        "items": [work_to_dict(w) for w in rows],
        "next_cursor": next_cursor,
        "has_more": next_cursor is not None,
        "total": total,  # 附加字段：FilterBar「共 N 幅」实时计数（DESIGN 5.8）
    }


# ---------------------------------------------------------------- /api/works

@router.get("/works")
def list_works(
    request: Request,
    session: Session = Depends(get_session),
    type: MediaType | None = None,
    album: str | None = Query(default=None, max_length=120),
    tag: list[str] = Query(default=[]),
    ratio: RatioBucket | None = None,
    featured: bool | None = None,
    q: str | None = Query(default=None, max_length=200),
    sort: SortOrder = "latest",
    cursor: str | None = None,
    limit: int = Query(default=24, ge=1, le=48),
):
    conds = _filter_conditions(
        type=type, album=album, tag=tag, ratio=ratio, featured=featured, q=q
    )
    payload = _works_page_payload(
        session, conds, sort=sort, cursor=cursor, limit=limit
    )
    return cached_json(request, payload)


def _neighbors(
    session: Session,
    work: Work,
    conds: list[ColumnElement[bool]],
    sort: SortOrder,
) -> tuple[str | None, str | None]:
    """同筛选序列内相邻作品 id（供 lightbox ←/→，DESIGN 3.1）。

    prev = 展示序列中位于其前者（latest 排序时即更新时间较近者），next 反之。
    """
    if work.created_at is None:
        return None, None
    created, wid = work.created_at, work.id
    newer = or_(
        Work.created_at > created, and_(Work.created_at == created, Work.id > wid)
    )
    older = or_(
        Work.created_at < created, and_(Work.created_at == created, Work.id < wid)
    )
    newest_first = (Work.created_at.desc(), Work.id.desc())
    oldest_first = (Work.created_at.asc(), Work.id.asc())
    if sort != "oldest":
        prev_cond, prev_order = newer, oldest_first
        next_cond, next_order = older, newest_first
    else:
        prev_cond, prev_order = older, newest_first
        next_cond, next_order = newer, oldest_first
    prev_id = session.scalar(
        select(Work.id).where(*conds, prev_cond).order_by(*prev_order).limit(1)
    )
    next_id = session.scalar(
        select(Work.id).where(*conds, next_cond).order_by(*next_order).limit(1)
    )
    return prev_id, next_id


@router.get("/works/{work_id}")
def get_work(
    work_id: str,
    request: Request,
    session: Session = Depends(get_session),
    type: MediaType | None = None,
    album: str | None = Query(default=None, max_length=120),
    tag: list[str] = Query(default=[]),
    ratio: RatioBucket | None = None,
    featured: bool | None = None,
    q: str | None = Query(default=None, max_length=200),
    sort: SortOrder = "latest",
):
    work = load_work(session, work_id)
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    conds = _filter_conditions(
        type=type, album=album, tag=tag, ratio=ratio, featured=featured, q=q
    )
    prev_id, next_id = _neighbors(session, work, conds, sort)
    return cached_json(
        request,
        {
            "work": work_to_dict(work, detail=True),
            "prev_id": prev_id,
            "next_id": next_id,
        },
    )


# ---------------------------------------------------------------- albums / tags / stats

def _album_public_dict(album: Album, session: Session) -> dict:
    work_count = (
        session.scalar(select(func.count(Work.id)).where(Work.album_id == album.id))
        or 0
    )
    return {
        "slug": album.slug,
        "name": album.name,
        "description": album.description,
        "cover_url": album.cover_url,
        "kind": album.kind,
        "work_count": work_count,
        "sort_weight": album.sort_weight,
    }


@router.get("/albums")
def list_albums(request: Request, session: Session = Depends(get_session)):
    albums = session.scalars(
        select(Album).order_by(Album.sort_weight.desc(), Album.created_at.asc())
    ).all()
    return cached_json(
        request, {"items": [_album_public_dict(a, session) for a in albums]}
    )


@router.get("/albums/{slug}")
def get_album(
    slug: str,
    request: Request,
    session: Session = Depends(get_session),
    type: MediaType | None = None,
    tag: list[str] = Query(default=[]),
    ratio: RatioBucket | None = None,
    featured: bool | None = None,
    q: str | None = Query(default=None, max_length=200),
    sort: SortOrder = "latest",
    cursor: str | None = None,
    limit: int = Query(default=24, ge=1, le=48),
):
    """专辑信息 + 与 GET /api/works?album={slug} 同构的作品 cursor 列表（合并响应）。"""
    album = session.scalar(select(Album).where(Album.slug == slug))
    if album is None:
        raise ApiError(404, "album_not_found", f"专辑不存在：{slug}")
    conds = _filter_conditions(
        type=type, album=slug, tag=tag, ratio=ratio, featured=featured, q=q
    )
    page = _works_page_payload(session, conds, sort=sort, cursor=cursor, limit=limit)
    return cached_json(request, {"album": _album_public_dict(album, session), **page})


@router.get("/tags")
def list_tags(request: Request, session: Session = Depends(get_session)):
    rows = session.execute(
        select(Tag.slug, Tag.name, func.count(Work.id).label("cnt"))
        .outerjoin(WorkTag, WorkTag.tag_id == Tag.id)
        .outerjoin(Work, Work.id == WorkTag.work_id)
        .group_by(Tag.id, Tag.slug, Tag.name)
        .order_by(func.count(Work.id).desc(), Tag.name.asc())
    ).all()
    return cached_json(
        request, [{"slug": s, "name": n, "count": c} for s, n, c in rows]
    )


@router.get("/stats")
def stats(request: Request, session: Session = Depends(get_session)):
    def _count(*conds) -> int:
        return session.scalar(select(func.count(Work.id)).where(*conds)) or 0

    return cached_json(
        request,
        {
            "works": {
                "images": _count(Work.type == "image"),
                "videos": _count(Work.type == "video"),
            },
            "albums": session.scalar(select(func.count(Album.id))) or 0,
            "tags": session.scalar(select(func.count(Tag.id))) or 0,
            "featured": _count(Work.featured == 1),
        },
    )


# ---------------------------------------------------------------- media 302

@router.get("/media/{work_id}")
def media_redirect(
    work_id: str,
    session: Session = Depends(get_session),
    kind: MediaKind = "original",
):
    """302 重定向到外部直链（存储透明切换）；不存在 → 404。"""
    work = session.scalar(select(Work).where(Work.id == work_id))
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    url = {
        "original": work.media_url,
        "thumb": work.thumb_url,
        "poster": work.poster_url,
    }[kind]
    if not url:
        raise ApiError(404, "media_not_found", "该作品无此类型的媒体文件")
    resp = RedirectResponse(url=url, status_code=302)
    resp.headers["Cache-Control"] = CACHE_CONTROL
    return resp
