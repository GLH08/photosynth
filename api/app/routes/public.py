"""公开只读 API（DESIGN 3.1 全量，M3 范围，无发布流：全量作品均展示）。

- cursor 分页：base64(排序键|id)，翻页期间新增数据不重不漏。
  时间排序键必须用非空 created_at（published_at 可空：NULL 行在比较中恒为
  NULL，会被 cursor 条件静默过滤导致提前终止，见 Build-E【1】）。
- Build-F【1】两种取数方式并存：
  连续滚动 = cursor（不重不漏）；分页模式 = page（offset，支持页码随机跳转）。
- Build-F【1】sort=name：名称自然排序（hy-1 < hy-2 < … < hy-10），
  排序在 SQL 侧完成（SQLite 用户函数 natural_sort_key，见 app/textsort.py）。
- 全部 JSON 响应带 Cache-Control: public, max-age=60 + ETag（内容哈希），If-None-Match → 304。
- /api/media/{id} → 302 重定向到外部直链（存储透明切换，前端零改动）；
  ?download=1 → 服务端转发外部直链并带 Content-Disposition（跨域直链无法用
  a[download] 直接下载，见 Build-F【3】）。
"""
from __future__ import annotations

import base64
import hashlib
from pathlib import PurePosixPath
from typing import Literal
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response, StreamingResponse
from sqlalchemy import ColumnElement, Float, and_, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..errors import ApiError
from ..models import Album, Tag, Work, WorkTag
from ..serializers import load_work, work_to_dict
from ..textsort import natural_sort_key
from ..workquery import work_is_active

router = APIRouter(prefix="/api", tags=["public"])

CACHE_CONTROL = "public, max-age=60"
_DOWNLOAD_TIMEOUT = 30.0
_CHUNK = 64 * 1024

SortOrder = Literal["latest", "oldest", "name"]
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

def encode_cursor(*parts: str) -> str:
    """cursor 载荷：base64url(part1|part2|…)，生成时去掉 padding。

    默认时间排序为 (created_at, id)；名称排序为 (natural_sort_key, id)。
    """
    return base64.urlsafe_b64encode("|".join(parts).encode()).decode().rstrip("=")


def encode_work_cursor(work: Work, sort: SortOrder) -> str:
    key = natural_sort_key(work.title) if sort == "name" else work.created_at
    return encode_cursor(key, work.id)


def decode_cursor(cursor: str) -> tuple[str, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)  # 生成时 rstrip 了 padding
        decoded = base64.urlsafe_b64decode(padded.encode()).decode()
        key, work_id = decoded.rsplit("|", 1)
    except Exception:
        raise ApiError(400, "invalid_cursor", "cursor 无效")
    if not key or not work_id:
        raise ApiError(400, "invalid_cursor", "cursor 无效")
    return key, work_id


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
    conds: list[ColumnElement[bool]] = [work_is_active()]  # Build-G：公开查询一律排除回收站
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
    """返回 (ORDER BY 列表, cursor 条件)；ORDER BY 末位恒为 id 保证全序唯一。"""
    if sort == "name":
        key = func.natural_sort_key(Work.title)
        cursor_cond = None
        if cursor:
            c_key, c_id = decode_cursor(cursor)
            cursor_cond = or_(key > c_key, and_(key == c_key, Work.id > c_id))
        return [key.asc(), Work.id.asc()], cursor_cond

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
    page: int | None = None,
) -> tuple[list[Work], int, str | None, bool]:
    """返回 (rows, total, next_cursor, has_more)；rows 带 album/tags 预加载。

    page 非空 → offset 分页（分页模式，供页码跳转）；否则 cursor 分页（连续滚动）。
    两种模式共用同一排序，保证顺序一致。
    """
    order, cursor_cond = _order_and_cursor(sort, cursor)
    where = list(conds)
    if cursor_cond is not None:
        where.append(cursor_cond)

    total = session.scalar(select(func.count(Work.id)).where(*conds)) or 0

    if page is not None:
        offset = (page - 1) * limit
        rows = list(
            session.scalars(
                select(Work)
                .where(*where)
                .options(selectinload(Work.album), selectinload(Work.tags))
                .order_by(*order)
                .offset(offset)
                .limit(limit)
            )
        )
        return rows, total, None, offset + len(rows) < total

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
    next_cursor = encode_work_cursor(rows[-1], sort) if has_more and rows else None
    return rows, total, next_cursor, has_more


def _works_page_payload(
    session: Session,
    conds: list[ColumnElement[bool]],
    *,
    sort: SortOrder,
    cursor: str | None,
    limit: int,
    page: int | None = None,
) -> dict:
    rows, total, next_cursor, has_more = _query_works_page(
        session, conds, sort=sort, cursor=cursor, limit=limit, page=page
    )
    return {
        "items": [work_to_dict(w) for w in rows],
        "next_cursor": next_cursor,
        "has_more": has_more,
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
    sort: SortOrder = "name",
    cursor: str | None = None,
    page: int | None = Query(default=None, ge=1),
    limit: int = Query(default=24, ge=1, le=48),
):
    conds = _filter_conditions(
        type=type, album=album, tag=tag, ratio=ratio, featured=featured, q=q
    )
    payload = _works_page_payload(
        session, conds, sort=sort, cursor=cursor, limit=limit, page=page
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
    name 排序时序列为 (natural_sort_key(title) ASC, id ASC)。
    """
    wid = work.id
    if sort == "name":
        key = func.natural_sort_key(Work.title)
        my_key = natural_sort_key(work.title)
        less = or_(key < my_key, and_(key == my_key, Work.id < wid))
        greater = or_(key > my_key, and_(key == my_key, Work.id > wid))
        prev_id = session.scalar(
            select(Work.id)
            .where(*conds, less)
            .order_by(key.desc(), Work.id.desc())
            .limit(1)
        )
        next_id = session.scalar(
            select(Work.id)
            .where(*conds, greater)
            .order_by(key.asc(), Work.id.asc())
            .limit(1)
        )
        return prev_id, next_id

    if work.created_at is None:
        return None, None
    created = work.created_at
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
    sort: SortOrder = "name",
):
    work = load_work(session, work_id)
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    # Build-L：调用方未显式传 type 时，邻接导航限定在该作品自身类型内
    # （视频详情上一幅/下一幅停留在视频序列；显式 type 参数行为不变）。
    conds = _filter_conditions(
        type=type or work.type, album=album, tag=tag, ratio=ratio, featured=featured, q=q
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
        session.scalar(
            select(func.count(Work.id)).where(
                Work.album_id == album.id, work_is_active()
            )
        )
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
    sort: SortOrder = "name",
    cursor: str | None = None,
    page: int | None = Query(default=None, ge=1),
    limit: int = Query(default=24, ge=1, le=48),
):
    """专辑信息 + 与 GET /api/works?album={slug} 同构的作品列表（合并响应）。"""
    album = session.scalar(select(Album).where(Album.slug == slug))
    if album is None:
        raise ApiError(404, "album_not_found", f"专辑不存在：{slug}")
    conds = _filter_conditions(
        type=type, album=slug, tag=tag, ratio=ratio, featured=featured, q=q
    )
    page_data = _works_page_payload(
        session, conds, sort=sort, cursor=cursor, limit=limit, page=page
    )
    return cached_json(request, {"album": _album_public_dict(album, session), **page_data})


@router.get("/tags")
def list_tags(request: Request, session: Session = Depends(get_session)):
    rows = session.execute(
        select(Tag.slug, Tag.name, func.count(Work.id).label("cnt"))
        .outerjoin(WorkTag, WorkTag.tag_id == Tag.id)
        .outerjoin(Work, and_(Work.id == WorkTag.work_id, work_is_active()))
        .group_by(Tag.id, Tag.slug, Tag.name)
        .order_by(func.count(Work.id).desc(), Tag.name.asc())
    ).all()
    return cached_json(
        request, [{"slug": s, "name": n, "count": c} for s, n, c in rows]
    )


@router.get("/stats")
def stats(request: Request, session: Session = Depends(get_session)):
    def _count(*conds) -> int:
        return session.scalar(
            select(func.count(Work.id)).where(work_is_active(), *conds)
        ) or 0

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


# ---------------------------------------------------------------- media 302 / 下载转发

def _download_name(url: str, work_id: str) -> str:
    """下载文件名：取直链末段（含扩展名），缺失时退回 work_{id}。"""
    name = PurePosixPath(unquote(urlparse(url).path)).name
    return name or f"work_{work_id}"


def _content_disposition(filename: str) -> str:
    """ASCII 回退 + RFC 5987 filename*（中文/特殊字符文件名也能正确落盘）。"""
    ascii_fallback = filename.encode("ascii", "ignore").decode() or "download"
    quoted = quote(filename, safe="")
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{quoted}'


def _open_upstream(url: str) -> tuple[httpx.Response, httpx.Client]:
    """打开外部直链的流式响应（单独抽出便于测试替换）。

    trust_env=False：不继承进程环境里的代理变量——服务端转发按直链语义直连
    （容器内无代理配置；环境里存在异常代理变量时也不会把 500 抛给用户）。
    任何连接/协议/URL 错误统一包装成 502，调用方拿到可读错误而非 500。
    """
    client = httpx.Client(follow_redirects=True, timeout=_DOWNLOAD_TIMEOUT, trust_env=False)
    try:
        resp = client.send(client.build_request("GET", url), stream=True)
    except (httpx.HTTPError, httpx.InvalidURL) as exc:  # 连接/超时/协议/URL 非法
        client.close()
        raise ApiError(502, "media_fetch_failed", f"无法获取原始文件：{exc}") from exc
    if resp.status_code >= 400:
        resp.close()
        client.close()
        raise ApiError(
            502, "media_fetch_failed", f"原始文件返回 HTTP {resp.status_code}"
        )
    return resp, client


def _download_response(url: str, filename: str) -> Response:
    """服务端转发外部直链为附件下载（跨域直链无法用 a[download]，见 BUILD-F【3】）。"""
    upstream, client = _open_upstream(url)

    def _iter():
        try:
            for chunk in upstream.iter_bytes(_CHUNK):
                yield chunk
        finally:
            upstream.close()
            client.close()

    headers = {
        "Content-Disposition": _content_disposition(filename),
        "Cache-Control": CACHE_CONTROL,
    }
    # 透传长度/类型（缺失则交给 chunked）
    if upstream.headers.get("content-length"):
        headers["Content-Length"] = upstream.headers["content-length"]
    media_type = upstream.headers.get("content-type", "application/octet-stream")
    return StreamingResponse(_iter(), media_type=media_type, headers=headers)


@router.get("/media/{work_id}")
def media_redirect(
    work_id: str,
    session: Session = Depends(get_session),
    kind: MediaKind = "original",
    download: bool = False,
):
    """302 重定向到外部直链（存储透明切换）；?download=1 → 代理为附件下载。

    不存在 → 404；该 kind 无文件 → 404 media_not_found。
    """
    work = session.scalar(
        select(Work).where(Work.id == work_id, work_is_active())
    )
    if work is None:
        raise ApiError(404, "work_not_found", "作品不存在")
    url = {
        "original": work.media_url,
        "thumb": work.thumb_url,
        "poster": work.poster_url,
    }[kind]
    if not url:
        raise ApiError(404, "media_not_found", "该作品无此类型的媒体文件")
    if download:
        return _download_response(url, _download_name(url, work_id))
    resp = RedirectResponse(url=url, status_code=302)
    resp.headers["Cache-Control"] = CACHE_CONTROL
    return resp
