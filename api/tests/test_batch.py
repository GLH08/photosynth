"""Build-H【2】批量操作用例（PATCH /api/admin/works/batch）：
迁移不涉及；覆盖 7 种 op、失败项隔离、op 级参数校验、CSRF 校验。
"""
from __future__ import annotations

from sqlalchemy import text

from tests.conftest import BEARER, image_payload


def _create(client, payload) -> str:
    r = client.post("/api/admin/works", json=payload, headers=BEARER)
    assert r.status_code == 201, r.text
    return r.json()["work"]["id"]


def _batch(client, ids, op, **extra):
    return client.patch("/api/admin/works/batch", json={"ids": ids, "op": op, **extra})


def _mk_album(client, slug="landscapes"):
    r = client.post(
        "/api/admin/albums",
        json={"slug": slug, "name": slug},
        headers=BEARER,
    )
    assert r.status_code == 201, r.text
    return slug


# ---------------------------------------------------------------- 精选开关

def test_batch_featured_and_unfeatured(admin):
    ids = [_create(admin, image_payload(external_file_id=f"h-f{i}")) for i in range(3)]

    r = _batch(admin, ids, "featured")
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": 3, "failed": []}
    assert admin.get("/api/admin/works", headers=BEARER).json()["stats"]["featured"] == 3

    r = _batch(admin, ids[:2], "unfeatured")
    assert r.json()["ok"] == 2
    assert admin.get("/api/admin/works", headers=BEARER).json()["stats"]["featured"] == 1


# ---------------------------------------------------------------- 回收站三态

def test_batch_trash_restore_purge(admin):
    ids = [_create(admin, image_payload(external_file_id=f"h-t{i}")) for i in range(3)]

    assert _batch(admin, ids, "trash").json() == {"ok": 3, "failed": []}
    assert admin.get("/api/works").json()["items"] == []
    assert admin.get("/api/admin/trash", headers=BEARER).json()["total"] == 3

    # 已在回收站者再 trash → 计入失败（不重复处理）
    failed = _batch(admin, ids, "trash").json()
    assert failed["ok"] == 0 and len(failed["failed"]) == 3

    # 恢复其中 2 条
    assert _batch(admin, ids[:2], "restore").json()["ok"] == 2
    assert admin.get("/api/admin/trash", headers=BEARER).json()["total"] == 1
    assert admin.get("/api/admin/works", headers=BEARER).json()["stats"]["total"] == 2

    # 彻底删除剩下 1 条 → 行物理消失
    assert _batch(admin, ids[2:], "purge").json()["ok"] == 1
    with admin.app.state.session_factory() as s:
        assert s.execute(
            text("SELECT COUNT(*) FROM works WHERE id = :i"), {"i": ids[2]}
        ).scalar() == 0


# ---------------------------------------------------------------- 移入专辑

def test_batch_move_album(admin):
    slug = _mk_album(admin)
    ids = [_create(admin, image_payload(external_file_id=f"h-a{i}")) for i in range(2)]

    r = _batch(admin, ids, "move_album", album_slug=slug)
    assert r.status_code == 200 and r.json()["ok"] == 2
    items = admin.get("/api/admin/works", headers=BEARER).json()["items"]
    assert all(it["album"]["slug"] == slug for it in items)

    # 不存在的专辑 → 整体 404（op 级参数非法），不改动任何作品
    assert _batch(admin, ids, "move_album", album_slug="nope").status_code == 404
    assert _batch(admin, ids, "move_album").status_code == 422  # 缺 album_slug


# ---------------------------------------------------------------- 加标签（追加不覆盖）

def test_batch_add_tags_appends(admin):
    wid = _create(admin, image_payload(external_file_id="h-tag", tag_slugs=["cyberpunk"]))

    r = _batch(admin, [wid], "add_tags", tag_slugs=["night", "rain"])
    assert r.status_code == 200 and r.json()["ok"] == 1
    tags = {t["slug"] for t in admin.get(f"/api/admin/works", headers=BEARER).json()["items"][0]["tags"]}
    assert tags == {"cyberpunk", "night", "rain"}  # 既有 cyberpunk 保留

    # 重复添加已有标签 → 幂等，不产生重复
    _batch(admin, [wid], "add_tags", tag_slugs=["night"])
    tags2 = [t["slug"] for t in admin.get("/api/admin/works", headers=BEARER).json()["items"][0]["tags"]]
    assert sorted(tags2) == ["cyberpunk", "night", "rain"]

    assert _batch(admin, [wid], "add_tags").status_code == 422  # 缺 tag_slugs


# ---------------------------------------------------------------- 失败项隔离

def test_batch_partial_failure(admin):
    wid = _create(admin, image_payload(external_file_id="h-x"))
    r = _batch(admin, [wid, "wk_missing"], "featured")
    body = r.json()
    assert body["ok"] == 1
    assert body["failed"] == [{"id": "wk_missing", "reason": "not_found"}]

    # ids 为空 → 422（schema min_length=1）
    assert _batch(admin, [], "featured").status_code == 422
    # 非法 op → 422
    assert _batch(admin, [wid], "explode").status_code == 422


# ---------------------------------------------------------------- CSRF

def test_batch_requires_csrf(admin):
    wid = _create(admin, image_payload(external_file_id="h-csrf"))
    admin.headers.pop("x-csrf-token", None)  # 模拟跨站伪造
    assert _batch(admin, [wid], "featured").status_code == 403
