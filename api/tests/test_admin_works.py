"""M2 管理 API 用例：登记/幂等/422 校验/列表过滤/PATCH/上下架/删除/albums/tags CRUD。"""
from __future__ import annotations

from tests.conftest import BEARER, image_payload, video_payload


def _create(client, payload, headers=BEARER):
    """默认走 Bearer；显式传 headers=None 时走 Cookie 登录态。"""
    return client.post("/api/admin/works", json=payload, headers=headers)


# ---------------------------------------------------------------- 登记与幂等

def test_create_image_work_201(admin):
    r = _create(admin, image_payload(), headers=None)
    assert r.status_code == 201, r.text
    work = r.json()["work"]
    assert work["id"].startswith("wk_")
    assert work["type"] == "image"
    assert work["title"] == "霓虹雨巷"
    assert work["width"] == 1024 and work["height"] == 1536
    assert work["storage_backend"] == "chevereto"
    assert work["visibility"] == "public"
    assert work["published_at"]  # public 登记即上架
    assert work["poster_url"] is None and work["duration_seconds"] is None
    assert [t["slug"] for t in work["tags"]] == ["cyberpunk"]  # 自动建缺失标签
    assert work["parameters"] == {"size": "1024x1536", "seed": 421087}


def test_create_work_idempotent_skipped(admin):
    payload = image_payload(external_file_id="dup-001")
    r1 = _create(admin, payload, headers=None)
    assert r1.status_code == 201
    r2 = _create(admin, {**payload, "title": "改个标题也跳过"}, headers=None)
    assert r2.status_code == 200
    body = r2.json()
    assert body["skipped"] is True
    assert body["reason"] == "external_file_id_exists"
    assert body["work"]["id"] == r1.json()["work"]["id"]
    # 库里只有一条
    listing = admin.get("/api/admin/works", headers=BEARER).json()
    assert listing["stats"]["total"] == 1
    assert listing["items"][0]["title"] == "霓虹雨巷"


def test_create_video_ok_201(admin):
    r = _create(admin, video_payload(), headers=None)
    assert r.status_code == 201, r.text
    work = r.json()["work"]
    assert work["type"] == "video"
    assert work["poster_url"].startswith("https://")
    assert work["duration_seconds"] == 6.2


# ---------------------------------------------------------------- 422 校验

def test_create_work_http_url_422(admin):
    r = _create(admin, image_payload(media_url="http://cdn.example.com/i/a.png"), headers=None)
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "invalid_media_url"
    assert "HTTPS" in body["message"]


def test_create_work_bad_dimensions_422(admin):
    assert _create(admin, image_payload(width=0), headers=None).status_code == 422
    assert _create(admin, image_payload(height=-5), headers=None).status_code == 422
    assert _create(admin, image_payload(width=None), headers=None).status_code == 422


def test_create_video_without_poster_422(admin):
    r = _create(admin, video_payload(poster_url=None), headers=None)
    assert r.status_code == 422
    r2 = _create(admin, video_payload(duration_seconds=None), headers=None)
    assert r2.status_code == 422
    # 图片不得带 poster/duration（DB CHECK 同语义）
    r3 = _create(admin, image_payload(poster_url="https://x.example/p.jpg"), headers=None)
    assert r3.status_code == 422


# ---------------------------------------------------------------- 列表与过滤

def test_admin_list_visibility_filter_and_stats(admin):
    _create(admin, image_payload(external_file_id="w-pub", visibility="public"), headers=None)
    _create(admin, image_payload(external_file_id="w-hid", visibility="hidden",
                                 title="下架作品"), headers=None)
    _create(admin, video_payload(external_file_id="w-vid", visibility="unlisted"), headers=None)

    all_items = admin.get("/api/admin/works", headers=BEARER).json()
    assert all_items["stats"] == {
        "total": 3, "public": 1, "unlisted": 1, "hidden": 1,
        "images": 2, "videos": 1, "featured": 0,
    }
    hidden = admin.get("/api/admin/works", params={"visibility": "hidden"}, headers=BEARER).json()
    assert [w["title"] for w in hidden["items"]] == ["下架作品"]
    vids = admin.get("/api/admin/works", params={"type": "video"}, headers=BEARER).json()
    assert len(vids["items"]) == 1 and vids["items"][0]["type"] == "video"
    q = admin.get("/api/admin/works", params={"q": "霓虹"}, headers=BEARER).json()
    assert len(q["items"]) == 1 and q["items"][0]["title"] == "霓虹雨巷"


def test_admin_list_pagination_cursor(admin):
    for i in range(5):
        _create(admin, image_payload(external_file_id=f"page-{i}", title=f"作品{i}"), headers=None)
    page1 = admin.get("/api/admin/works", params={"limit": 2}, headers=BEARER).json()
    assert len(page1["items"]) == 2 and page1["has_more"] is True
    page2 = admin.get("/api/admin/works",
                      params={"limit": 2, "cursor": page1["next_cursor"]}, headers=BEARER).json()
    ids1 = {w["id"] for w in page1["items"]}
    ids2 = {w["id"] for w in page2["items"]}
    assert not (ids1 & ids2)  # 翻页无重复


# ---------------------------------------------------------------- PATCH / 上下架 / 删除

def test_patch_work(admin):
    wid = _create(admin, image_payload(external_file_id="patch-1"), headers=None).json()["work"]["id"]
    r = admin.patch(f"/api/admin/works/{wid}",
                    json={"title": "霓虹雨巷（重调色彩）", "featured": True,
                          "tag_slugs": ["cyberpunk", "rain", "night"]},
                    headers=BEARER)
    assert r.status_code == 200
    work = r.json()["work"]
    assert work["title"] == "霓虹雨巷（重调色彩）"
    assert work["featured"] is True
    assert sorted(t["slug"] for t in work["tags"]) == ["cyberpunk", "night", "rain"]
    # PATCH 不存在的作品 → 404
    assert admin.patch("/api/admin/works/wk_missing000", json={"title": "x"},
                       headers=BEARER).status_code == 404


def test_publish_unpublish(admin):
    wid = _create(admin, image_payload(external_file_id="pub-1", visibility="hidden"),
                  headers=None).json()["work"]["id"]
    r = admin.post(f"/api/admin/works/{wid}/unpublish", headers=BEARER)
    assert r.status_code == 200 and r.json()["visibility"] == "hidden"
    r2 = admin.post(f"/api/admin/works/{wid}/publish", headers=BEARER)
    assert r2.status_code == 200
    assert r2.json()["visibility"] == "public"
    assert r2.json()["published_at"]  # 首次上架补 published_at


def test_delete_work(admin):
    wid = _create(admin, image_payload(external_file_id="del-1", tag_slugs=["rain"]),
                  headers=None).json()["work"]["id"]
    # 未带 confirm → 400
    r = admin.delete(f"/api/admin/works/{wid}", headers=BEARER)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "confirm_required"
    # confirm=true → 204，行与 work_tags 关联删除
    assert admin.delete(f"/api/admin/works/{wid}", params={"confirm": "true"},
                        headers=BEARER).status_code == 204
    assert admin.get("/api/admin/works", headers=BEARER).json()["stats"]["total"] == 0
    with admin.app.state.session_factory() as s:
        from sqlalchemy import text
        assert s.execute(text("SELECT COUNT(*) FROM work_tags")).scalar() == 0
    # 再删 → 404
    assert admin.delete(f"/api/admin/works/{wid}", params={"confirm": "true"},
                        headers=BEARER).status_code == 404


# ---------------------------------------------------------------- albums / tags CRUD

def test_album_crud(admin):
    r = admin.post("/api/admin/albums",
                   json={"slug": "city-impressions", "name": "城市印象", "kind": "image"},
                   headers=BEARER)
    assert r.status_code == 201
    album = r.json()
    # slug 冲突 → 409
    r2 = admin.post("/api/admin/albums",
                    json={"slug": "city-impressions", "name": "重复"}, headers=BEARER)
    assert r2.status_code == 409 and r2.json()["error"]["code"] == "slug_conflict"
    # PATCH
    r3 = admin.patch(f"/api/admin/albums/{album['id']}",
                     json={"description": "更新简介", "sort_weight": 5}, headers=BEARER)
    assert r3.status_code == 200 and r3.json()["description"] == "更新简介"
    # 作品挂专辑 → 删专辑后 album_id 置空（ON DELETE SET NULL）
    wid = _create(admin, image_payload(external_file_id="alb-1", album_slug="city-impressions"),
                  headers=None).json()["work"]["id"]
    assert admin.delete(f"/api/admin/albums/{album['id']}", headers=BEARER).status_code == 204
    work = admin.get("/api/admin/works", headers=BEARER).json()["items"][0]
    assert work["id"] == wid and work["album"] is None
    # 挂不存在的专辑 → 404
    assert _create(admin, image_payload(external_file_id="alb-2", album_slug="nope"),
                   headers=None).status_code == 404


def test_tag_crud(admin):
    r = admin.post("/api/admin/tags", json={"name": "赛博朋克", "slug": "cyberpunk"},
                   headers=BEARER)
    assert r.status_code == 201
    tag = r.json()
    assert admin.post("/api/admin/tags", json={"name": "赛博朋克2", "slug": "cyberpunk"},
                      headers=BEARER).status_code == 409
    # PATCH 改名
    r2 = admin.patch(f"/api/admin/tags/{tag['id']}", json={"name": "赛博"}, headers=BEARER)
    assert r2.status_code == 200 and r2.json()["name"] == "赛博"
    # 作品打标签后删标签 → 关联解除
    _create(admin, image_payload(external_file_id="tag-1", tag_slugs=["cyberpunk"]), headers=None)
    assert admin.delete(f"/api/admin/tags/{tag['id']}", headers=BEARER).status_code == 204
    items = admin.get("/api/admin/works", headers=BEARER).json()["items"]
    assert items[0]["tags"] == []
    assert admin.get("/api/admin/tags", headers=BEARER).json()["items"] == []
