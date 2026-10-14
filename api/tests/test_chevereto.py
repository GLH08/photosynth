"""Chevereto 变体派生单测（Build-M1）＋ 登记默认 thumb 走 `.md` 变体（Build-M8）。"""
from __future__ import annotations

from app.chevereto import chevereto_variant
from tests.conftest import BEARER, image_payload

HUMAN = "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.png"


def test_variant_human_readable():
    assert chevereto_variant(HUMAN, "th") == (
        "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png"
    )
    assert chevereto_variant(HUMAN, "md") == (
        "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.md.png"
    )


def test_variant_hash_named():
    url = "https://chevereto.novaw.de/images/2026/10/09/4a568c37abc.png"
    assert chevereto_variant(url, "th") == (
        "https://chevereto.novaw.de/images/2026/10/09/4a568c37abc.th.png"
    )


def test_variant_non_chevereto_unchanged():
    picsum = "https://picsum.photos/id/1015/1600/1067"
    assert chevereto_variant(picsum, "th") == picsum
    assert chevereto_variant(picsum, "md") == picsum


def test_variant_already_variant_unchanged():
    th = "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png"
    assert chevereto_variant(th, "th") == th
    assert chevereto_variant(th, "md") == th


def test_variant_with_query_preserved():
    assert chevereto_variant(f"{HUMAN}?v=2", "th") == (
        "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png?v=2"
    )


def test_variant_non_image_unchanged():
    mp4 = "https://chevereto.novaw.de/images/2026/10/09/4a568c37abc.mp4"
    assert chevereto_variant(mp4, "md") == mp4


def test_create_defaults_thumb_to_md_variant(admin):
    """未提供 thumb_url 且 media_url 为 Chevereto 图片 → thumb_url = 等比 `.md` 变体。"""
    payload = image_payload(media_url=HUMAN, thumb_url=None, external_file_id="md-default")
    r = admin.post("/api/admin/works", json=payload, headers=None)
    assert r.status_code == 201, r.text
    work = r.json()["work"]
    assert work["media_url"] == HUMAN
    assert work["thumb_url"] == (
        "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.md.png"
    )


def test_create_non_chevereto_thumb_falls_back_to_media(admin):
    """非 Chevereto media_url：thumb 兜底仍等于 media_url（不变）。"""
    media = "https://picsum.photos/id/1015/1600/1067"
    payload = image_payload(media_url=media, thumb_url=None, external_file_id="th-fallback")
    r = admin.post("/api/admin/works", json=payload, headers=None)
    assert r.status_code == 201, r.text
    assert r.json()["work"]["thumb_url"] == media


def test_create_explicit_thumb_url_wins(admin):
    """显式 thumb_url 优先，不被变体覆盖。"""
    payload = image_payload(media_url=HUMAN, thumb_url="https://cdn.example.com/custom.th.png")
    r = admin.post("/api/admin/works", json=payload, headers=BEARER)
    assert r.status_code == 201, r.text
    assert r.json()["work"]["thumb_url"] == "https://cdn.example.com/custom.th.png"
