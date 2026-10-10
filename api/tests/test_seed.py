"""种子数据用例：写入 DESIGN 7.2 全量内容且幂等。"""
from __future__ import annotations

from sqlalchemy import func, select

from app.models import Album, Tag, Work
from app.seed import run_seed


def _counts(session):
    return {
        "works": session.scalar(select(func.count(Work.id))),
        "albums": session.scalar(select(func.count(Album.id))),
        "tags": session.scalar(select(func.count(Tag.id))),
    }


def test_seed_writes_demo_dataset(client):
    with client.app.state.session_factory() as s:
        assert run_seed(s) is True
        counts = _counts(s)
        assert counts == {"works": 14, "albums": 2, "tags": 6}  # 12 图 + 2 视频

        works = s.scalars(select(Work)).all()
        assert all(w.storage_backend == "demo" for w in works)
        assert sum(1 for w in works if w.type == "video") == 2
        assert sum(1 for w in works if w.featured) == 3  # 1050/1069/1080
        assert sum(1 for w in works if w.visibility == "unlisted") == 1
        assert sum(1 for w in works if w.visibility == "hidden") == 1
        # 图生图示例：1025 带 2 张参考图
        husky = next(w for w in works if w.external_file_id == "demo-picsum-1025")
        import json
        refs = json.loads(husky.reference_images)
        assert len(refs) == 2 and refs[0]["order"] == 1
        # 视频完整性（poster + duration）
        for v in [w for w in works if w.type == "video"]:
            assert v.poster_url and v.duration_seconds
        # thumb 是 picsum 小尺寸变体
        assert all("/480/" in w.thumb_url for w in works if w.type == "image")


def test_seed_idempotent(client):
    with client.app.state.session_factory() as s:
        assert run_seed(s) is True
        first = _counts(s)
    with client.app.state.session_factory() as s:
        assert run_seed(s) is False  # 非空即跳过
        assert _counts(s) == first
