"""M3 公开只读 API 用例（DESIGN 3.1）：
分页游标无重漏 / ratio 筛选 / hidden·unlisted 过滤 / prev·next / 302 / ETag / 404 / 标签 AND / 专辑 / stats / OpenAPI。
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.main import app
from app.models import Album, Tag, Work

# ---------------------------------------------------------------- 数据工厂


@pytest.fixture()
def db():
    with app.state.session_factory() as s:
        yield s


def _tag(session, slug: str) -> Tag:
    tag = session.scalar(select(Tag).where(Tag.slug == slug))
    if tag is None:
        tag = Tag(id=f"tg_{slug}", name=slug, slug=slug, created_at="2026-09-01T00:00:00Z")
        session.add(tag)
        session.flush()
    return tag


def _album(session, slug: str, *, sort_weight: int = 0, kind: str = "mixed") -> Album:
    album = session.scalar(select(Album).where(Album.slug == slug))
    if album is None:
        album = Album(
            id=f"al_{slug}", slug=slug, name=slug, description="",
            kind=kind, sort_weight=sort_weight,
            created_at="2026-09-01T00:00:00Z", updated_at="2026-09-01T00:00:00Z",
        )
        session.add(album)
        session.flush()
    return album


def mk_work(
    session,
    idx: int,
    *,
    type: str = "image",
    w: int = 1000,
    h: int = 1000,
    featured: bool = False,
    published_at: str | None = None,
    album: Album | None = None,
    tags: tuple[str, ...] = (),
    title: str | None = None,
    prompt: str = "a test prompt",
    parameters: dict | None = None,
    reference_images: list | None = None,
    negative_prompt: str | None = None,
) -> Work:
    ts = published_at or f"2026-09-{idx:02d}T08:00:00Z"
    is_video = type == "video"
    work = Work(
        id=f"wk_test{idx:03d}",
        type=type,
        title=title or f"作品{idx}",
        description="",
        prompt=prompt,
        negative_prompt=negative_prompt,
        model_name="Hy Image 3.5 Preview",
        model_version="3.5-preview-0928" if not is_video else None,
        parameters=json.dumps(parameters or {}),
        reference_images=json.dumps(reference_images or []),
        media_url=f"https://cdn.example.com/{'v' if is_video else 'i'}/{idx}.{'mp4' if is_video else 'png'}",
        thumb_url=f"https://cdn.example.com/i/{idx}.th.png",
        poster_url=f"https://cdn.example.com/v/{idx}.frame.jpg" if is_video else None,
        width=w,
        height=h,
        duration_seconds=6.5 if is_video else None,
        storage_backend="test",
        external_file_id=f"ext-{type}-{idx}",
        album_id=album.id if album else None,
        featured=1 if featured else 0,
        created_at=ts,
        published_at=ts,
        updated_at=ts,
    )
    session.add(work)
    session.flush()
    for slug in tags:
        work.tags.append(_tag(session, slug))
    session.commit()
    return work


# ---------------------------------------------------------------- 可见性与列表字段


def test_list_all_works_and_lightbox_fields(client, db):
    """无发布流：全部作品均展示。"""
    mk_work(db, 1)
    mk_work(db, 2)
    mk_work(db, 3)
    r = client.get("/api/works")
    assert r.status_code == 200
    body = r.json()
    ids = [it["id"] for it in body["items"]]
    assert ids == ["wk_test003", "wk_test002", "wk_test001"]  # latest 排序
    assert body["has_more"] is False and body["next_cursor"] is None
    item = body["items"][0]
    # 列表项即含 lightbox 所需字段（DESIGN 3.1）
    for field in ("width", "height", "thumb_url", "media_url", "prompt", "model_name",
                  "featured", "album", "tags", "published_at"):
        assert field in item
    # 内部字段不出现在公开列表
    assert "storage_backend" not in item and "external_file_id" not in item


def test_detail_fields_and_404(client, db):
    """无发布流：详情含内部字段（新作品默认可见），不存在 → 404。"""
    mk_work(db, 1, negative_prompt="blurry", parameters={"seed": 42},
            reference_images=[{"order": 1, "url": "https://cdn.example.com/r/1.png"}])

    r = client.get("/api/works/wk_test001")
    assert r.status_code == 200
    work = r.json()["work"]
    for field in ("negative_prompt", "model_version", "parameters", "reference_images",
                  "source_meta", "storage_backend", "created_at", "updated_at"):
        assert field in work
    assert "visibility" not in work  # 不再对外暴露
    assert work["parameters"] == {"seed": 42}
    assert work["negative_prompt"] == "blurry"

    r4 = client.get("/api/works/wk_nope")
    assert r4.status_code == 404 and r4.json()["error"]["code"] == "work_not_found"


# ---------------------------------------------------------------- cursor 分页


def test_pagination_cursor_no_overlap_no_gap(client, db):
    for i in range(1, 8):  # published_at 2026-09-01..07，latest 排序 = 07→01
        mk_work(db, i)

    full = client.get("/api/works?limit=48").json()
    full_ids = [it["id"] for it in full["items"]]
    assert full_ids == [f"wk_test{i:03d}" for i in range(7, 0, -1)]

    p1 = client.get("/api/works?limit=3").json()
    assert p1["has_more"] is True and p1["next_cursor"]
    p2 = client.get(f"/api/works?limit=3&cursor={p1['next_cursor']}").json()
    p3 = client.get(f"/api/works?limit=3&cursor={p2['next_cursor']}").json()
    assert p2["has_more"] is True
    assert p3["has_more"] is False and p3["next_cursor"] is None

    paged = [it["id"] for it in p1["items"] + p2["items"] + p3["items"]]
    assert paged == full_ids  # 无重无漏
    assert len(set(paged)) == len(paged)


def test_pagination_stable_when_new_work_inserted_midway(client, db):
    """cursor 优于 offset 的核心保证：翻页期间新增数据不重不漏。"""
    for i in range(1, 7):
        mk_work(db, i)
    p1 = client.get("/api/works?limit=3").json()
    seen = {it["id"] for it in p1["items"]}

    # 翻页间隙插入一幅更新的作品（应只影响第一页，不造成后页重复/跳过）
    mk_work(db, 99, published_at="2026-10-01T00:00:00Z")
    p2 = client.get(f"/api/works?limit=3&cursor={p1['next_cursor']}").json()
    ids2 = [it["id"] for it in p2["items"]]
    assert ids2 == ["wk_test003", "wk_test002", "wk_test001"]
    assert not (seen & set(ids2))


def test_invalid_cursor_400(client, db):
    mk_work(db, 1)
    r = client.get("/api/works?cursor=%25%25not-base64%25%25")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_cursor"


def test_sort_oldest_reverses(client, db):
    for i in range(1, 4):
        mk_work(db, i)
    latest = [it["id"] for it in client.get("/api/works").json()["items"]]
    oldest = [it["id"] for it in client.get("/api/works?sort=oldest").json()["items"]]
    assert latest == ["wk_test003", "wk_test002", "wk_test001"]
    assert oldest == list(reversed(latest))
    # oldest 方向的 cursor 同样可用
    p1 = client.get("/api/works?sort=oldest&limit=2").json()
    p2 = client.get(f"/api/works?sort=oldest&limit=2&cursor={p1['next_cursor']}").json()
    assert [it["id"] for it in p2["items"]] == ["wk_test003"]


# ---------------------------------------------------------------- ratio / tag / featured / q


def test_ratio_filter(client, db):
    mk_work(db, 1, w=1000, h=1600)   # portrait
    mk_work(db, 2, w=1000, h=1050)   # 差值内 → square
    mk_work(db, 3, w=1600, h=1000)   # landscape
    mk_work(db, 4, w=1000, h=1000)   # square
    mk_work(db, 5, w=1920, h=800)    # landscape 超宽

    def ids(ratio: str) -> set[str]:
        r = client.get(f"/api/works?ratio={ratio}")
        return {it["id"] for it in r.json()["items"]}

    assert ids("portrait") == {"wk_test001"}
    assert ids("square") == {"wk_test002", "wk_test004"}
    assert ids("landscape") == {"wk_test003", "wk_test005"}


def test_tag_multi_value_and_semantics(client, db):
    mk_work(db, 1, tags=("city", "night"))
    mk_work(db, 2, tags=("city",))
    mk_work(db, 3, tags=("night",))
    mk_work(db, 4, tags=("nature",))

    both = client.get("/api/works?tag=city&tag=night").json()["items"]
    assert [it["id"] for it in both] == ["wk_test001"]
    city = client.get("/api/works?tag=city").json()["items"]
    assert {it["id"] for it in city} == {"wk_test001", "wk_test002"}
    # 不存在的标签 → 空集而非报错
    assert client.get("/api/works?tag=nope").json()["items"] == []


def test_featured_and_q_filters(client, db):
    mk_work(db, 1, featured=True, title="霓虹雨巷", prompt="cyberpunk alley in heavy rain")
    mk_work(db, 2, title="山径", prompt="a narrow mountain trail")

    feat = client.get("/api/works?featured=1").json()["items"]
    assert [it["id"] for it in feat] == ["wk_test001"]
    assert [it["id"] for it in client.get("/api/works?q=雨巷").json()["items"]] == ["wk_test001"]
    assert [it["id"] for it in client.get("/api/works?q=mountain").json()["items"]] == ["wk_test002"]
    assert client.get("/api/works?q=不存在关键词").json()["items"] == []
    # 组合：type=image 且 featured
    combo = client.get("/api/works?type=image&featured=1").json()["items"]
    assert [it["id"] for it in combo] == ["wk_test001"]
    assert client.get("/api/works?type=video").json()["items"] == []


# ---------------------------------------------------------------- prev / next


def test_detail_prev_next_same_filter_sequence(client, db):
    for i in range(1, 6):
        mk_work(db, i)  # latest: 005 → 001

    mid = client.get("/api/works/wk_test003").json()
    assert mid["prev_id"] == "wk_test004" and mid["next_id"] == "wk_test002"
    newest = client.get("/api/works/wk_test005").json()
    assert newest["prev_id"] is None and newest["next_id"] == "wk_test004"
    oldest = client.get("/api/works/wk_test001").json()
    assert oldest["prev_id"] == "wk_test002" and oldest["next_id"] is None

    # 同筛选序列：加 ratio 后邻接只在竖图内计算
    mk_work(db, 6, w=1000, h=1500, published_at="2026-09-10T08:00:00Z")
    mk_work(db, 7, w=1000, h=1600, published_at="2026-09-11T08:00:00Z")
    mk_work(db, 8, w=1600, h=1000, published_at="2026-09-12T08:00:00Z")  # 横图，插入序列但不属竖图
    r = client.get("/api/works/wk_test006?ratio=portrait").json()
    assert r["prev_id"] == "wk_test007" and r["next_id"] is None
    # sort=oldest 时方向翻转
    r2 = client.get("/api/works/wk_test003?sort=oldest").json()
    assert r2["prev_id"] == "wk_test002" and r2["next_id"] == "wk_test004"


# ---------------------------------------------------------------- media 302


def test_media_redirect_302(client, db):
    mk_work(db, 1)
    mk_work(db, 2, type="video")

    r = client.get("/api/media/wk_test001", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "https://cdn.example.com/i/1.png"
    assert r.headers["cache-control"] == "public, max-age=60"

    r_thumb = client.get("/api/media/wk_test001?kind=thumb", follow_redirects=False)
    assert r_thumb.status_code == 302
    assert r_thumb.headers["location"] == "https://cdn.example.com/i/1.th.png"

    r_poster = client.get("/api/media/wk_test002?kind=poster", follow_redirects=False)
    assert r_poster.status_code == 302
    assert r_poster.headers["location"] == "https://cdn.example.com/v/2.frame.jpg"

    # 图片没有 poster → 404 media_not_found；不存在 → 404
    assert client.get("/api/media/wk_test001?kind=poster").status_code == 404
    assert client.get("/api/media/wk_nope", follow_redirects=False).status_code == 404


# ---------------------------------------------------------------- ETag / Cache-Control


def test_etag_and_cache_control_304(client, db):
    mk_work(db, 1)
    r1 = client.get("/api/works")
    assert r1.headers["cache-control"] == "public, max-age=60"
    etag = r1.headers["etag"]
    assert etag.startswith('"') and etag.endswith('"')

    r2 = client.get("/api/works", headers={"If-None-Match": etag})
    assert r2.status_code == 304
    assert r2.headers["etag"] == etag

    # 数据变化 → ETag 变化，旧 ETag 不再命中
    mk_work(db, 2)
    r3 = client.get("/api/works")
    assert r3.headers["etag"] != etag
    assert r3.status_code == 200

    # 其余公开接口同样带缓存头
    for path in ("/api/albums", "/api/tags", "/api/stats"):
        rr = client.get(path)
        assert rr.headers["cache-control"] == "public, max-age=60", path
        assert "etag" in rr.headers, path


# ---------------------------------------------------------------- albums / tags / stats


def test_albums_endpoints(client, db):
    city = _album(db, "city", sort_weight=20, kind="image")
    nature = _album(db, "nature", sort_weight=10)
    mk_work(db, 1, album=city)
    mk_work(db, 2, album=city)
    mk_work(db, 3, album=city)
    mk_work(db, 4, album=nature, type="video")

    r = client.get("/api/albums")
    assert r.status_code == 200
    items = r.json()["items"]
    assert [a["slug"] for a in items] == ["city", "nature"]  # sort_weight 降序
    assert items[0]["work_count"] == 3
    assert items[1]["work_count"] == 1
    assert set(items[0]) == {"slug", "name", "description", "cover_url", "kind",
                             "work_count", "sort_weight"}

    r2 = client.get("/api/albums/city")
    body = r2.json()
    assert body["album"]["slug"] == "city"
    assert {it["id"] for it in body["items"]} == {"wk_test001", "wk_test002", "wk_test003"}
    assert body["has_more"] is False

    # 专辑内作品列表同样支持 cursor 分页（latest：003→002→001）
    p1 = client.get("/api/albums/city?limit=1").json()
    assert p1["has_more"] is True
    p2 = client.get(f"/api/albums/city?limit=1&cursor={p1['next_cursor']}").json()
    assert [it["id"] for it in p2["items"]] == ["wk_test002"]

    r3 = client.get("/api/albums/nope")
    assert r3.status_code == 404
    assert r3.json()["error"]["code"] == "album_not_found"


def test_tags_and_stats(client, db):
    city = _album(db, "city")
    mk_work(db, 1, tags=("a", "b"), album=city, featured=True)
    mk_work(db, 2, tags=("a",), album=city)
    mk_work(db, 3, tags=("b",), featured=True)
    mk_work(db, 4, type="video")

    r = client.get("/api/tags")
    assert r.status_code == 200
    tags = r.json()
    assert isinstance(tags, list)  # 裸数组（DESIGN 3.1）
    assert tags[0] == {"slug": "a", "name": "a", "count": 2}
    assert [t["slug"] for t in tags] == ["a", "b"]  # count 降序

    s = client.get("/api/stats").json()
    assert s == {"works": {"images": 3, "videos": 1}, "albums": 1, "tags": 2, "featured": 2}


# ---------------------------------------------------------------- OpenAPI


def test_openapi_has_public_and_hides_admin(client):
    spec = client.get("/openapi.json").json()
    paths = set(spec["paths"])
    for p in ("/api/works", "/api/works/{work_id}", "/api/albums", "/api/albums/{slug}",
              "/api/tags", "/api/stats", "/api/media/{work_id}", "/api/health"):
        assert p in paths, p
    assert not any(p.startswith("/api/admin") for p in paths)
