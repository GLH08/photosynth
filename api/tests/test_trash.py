"""Build-G 回收站（软删除）用例：
删除后公开全部查不到 / trash 可见 / restore 回来 / purge 彻底没 / trash 分页倒序 / 写操作 CSRF。
"""
from __future__ import annotations

from sqlalchemy import text

from tests.conftest import BEARER, image_payload


def _create(client, payload) -> str:
    r = client.post("/api/admin/works", json=payload, headers=BEARER)
    assert r.status_code == 201, r.text
    return r.json()["work"]["id"]


def _delete(client, wid: str):
    return client.delete(f"/api/admin/works/{wid}", params={"confirm": "true"}, headers=BEARER)


# ---------------------------------------------------------------- 删除 → 公开隐藏

def test_soft_delete_hides_from_public_but_visible_in_trash(admin):
    wid = _create(admin, image_payload(external_file_id="g-1", tag_slugs=["cyberpunk"]))
    # 删除前：公开可见
    assert [w["id"] for w in admin.get("/api/works").json()["items"]] == [wid]

    assert _delete(admin, wid).status_code == 204

    # 公开 API 全部查不到（列表 / 详情 / 搜索 / 统计 / 标签计数 / 媒体代理）
    assert admin.get("/api/works").json()["items"] == []
    assert admin.get(f"/api/works/{wid}").status_code == 404
    assert admin.get("/api/works", params={"q": "霓虹"}).json()["items"] == []
    assert admin.get("/api/stats").json()["works"] == {"images": 0, "videos": 0}
    assert [t["count"] for t in admin.get("/api/tags").json()] == [0]
    assert admin.get(f"/api/media/{wid}").status_code == 404

    # 管理列表默认排除回收站，回收站里能查到（带 deleted_at）
    assert admin.get("/api/admin/works", headers=BEARER).json()["stats"]["total"] == 0
    trash = admin.get("/api/admin/trash", headers=BEARER).json()
    assert trash["total"] == 1 and trash["has_more"] is False and trash["offset"] == 0
    item = trash["items"][0]
    assert item["id"] == wid and item["deleted_at"]


# ---------------------------------------------------------------- 恢复

def test_restore_brings_back(admin):
    wid = _create(admin, image_payload(external_file_id="g-2"))
    _delete(admin, wid)

    r = admin.post(f"/api/admin/works/{wid}/restore", headers=BEARER)
    assert r.status_code == 200, r.text
    assert r.json()["work"]["deleted_at"] is None

    # 回到公开列表 / 详情，回收站清空
    assert [w["id"] for w in admin.get("/api/works").json()["items"]] == [wid]
    assert admin.get(f"/api/works/{wid}").status_code == 200
    assert admin.get("/api/admin/trash", headers=BEARER).json()["total"] == 0
    assert admin.get("/api/admin/works", headers=BEARER).json()["stats"]["total"] == 1

    # 恢复不存在的作品 → 404
    assert admin.post("/api/admin/works/wk_nope/restore", headers=BEARER).status_code == 404


# ---------------------------------------------------------------- 彻底删除

def test_purge_removes_forever(admin):
    wid = _create(admin, image_payload(external_file_id="g-3", tag_slugs=["rain"]))
    _delete(admin, wid)

    assert admin.delete(f"/api/admin/works/{wid}/purge", headers=BEARER).status_code == 204

    # 行与 work_tags 关联都物理消失
    with admin.app.state.session_factory() as s:
        assert s.execute(
            text("SELECT COUNT(*) FROM works WHERE id = :i"), {"i": wid}
        ).scalar() == 0
        assert s.execute(text("SELECT COUNT(*) FROM work_tags")).scalar() == 0
    assert admin.get("/api/admin/trash", headers=BEARER).json()["total"] == 0

    # purge 不存在 → 404
    assert admin.delete("/api/admin/works/wk_nope/purge", headers=BEARER).status_code == 404


# ---------------------------------------------------------------- 分页与倒序

def test_trash_pagination_and_order(admin):
    ids = [
        _create(admin, image_payload(external_file_id=f"g-p{i}", title=f"作品{i}"))
        for i in range(3)
    ]
    for wid in ids:
        _delete(admin, wid)

    # 同一秒删除无法区分先后，直接改库给出可区分的 deleted_at 以验证「倒序」契约
    with admin.app.state.session_factory() as s:
        for i, wid in enumerate(ids):
            s.execute(
                text("UPDATE works SET deleted_at = :d WHERE id = :i"),
                {"d": f"2026-10-0{i + 1}T00:00:00Z", "i": wid},
            )
        s.commit()

    page1 = admin.get("/api/admin/trash", params={"limit": 2}, headers=BEARER).json()
    assert page1["total"] == 3 and page1["has_more"] is True and len(page1["items"]) == 2
    page2 = admin.get(
        "/api/admin/trash", params={"limit": 2, "offset": 2}, headers=BEARER
    ).json()
    assert page2["has_more"] is False and len(page2["items"]) == 1

    # deleted_at 倒序：最近删除（deleted_at 值最大）在前
    ordered = [it["id"] for it in page1["items"] + page2["items"]]
    assert ordered == list(reversed(ids))
    assert set(ordered) == set(ids)  # 无重无漏


# ---------------------------------------------------------------- CSRF

def test_trash_write_endpoints_require_csrf(admin):
    """CSRF：回收站写操作（restore/purge）走 Cookie 认证时同样受 Double-Submit 保护。"""
    wid = _create(admin, image_payload(external_file_id="g-csrf"))
    _delete(admin, wid)

    admin.headers.pop("x-csrf-token", None)  # 模拟跨站伪造请求
    assert admin.post(f"/api/admin/works/{wid}/restore").status_code == 403
    assert admin.delete(f"/api/admin/works/{wid}/purge").status_code == 403

    # 回收站读取（GET）无需 CSRF
    assert admin.get("/api/admin/trash").status_code == 200
