"""启动种子（DESIGN 7.1）：SEED_DEMO=true 且 works 为空 → 事务内写入；幂等可反复重启。"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import Settings, load_settings
from ..db import make_engine, make_session_factory
from ..ids import nanoid, utcnow_iso
from ..models import Album, Tag, Work
from .demo_data import DEMO_ALBUMS, DEMO_TAGS, DEMO_WORKS


def run_seed(session: Session) -> bool:
    """返回是否实际写入。非空即跳过（幂等）。"""
    existing = session.scalar(select(func.count(Work.id))) or 0
    if existing > 0:
        return False

    now = utcnow_iso()
    album_ids: dict[str, str] = {}
    for a in DEMO_ALBUMS:
        album = Album(
            id=nanoid("al_"),
            slug=a["slug"],
            name=a["name"],
            description=a["description"],
            cover_url=a.get("cover_url"),
            kind=a["kind"],
            sort_weight=a.get("sort_weight", 0),
            created_at=now,
            updated_at=now,
        )
        session.add(album)
        album_ids[a["slug"]] = album.id

    tag_objs: dict[str, Tag] = {}
    for t in DEMO_TAGS:
        tag = Tag(id=nanoid("tg_"), name=t["name"], slug=t["slug"], created_at=now)
        session.add(tag)
        tag_objs[t["slug"]] = tag

    for w in DEMO_WORKS:
        work = Work(
            id=nanoid("wk_"),
            type=w["type"],
            title=w["title"],
            description=w.get("description", ""),
            prompt=w["prompt"],
            negative_prompt=w.get("negative_prompt"),
            model_name=w.get("model_name", ""),
            model_version=w.get("model_version"),
            parameters=_dumps(w.get("parameters", {})),
            reference_images=_dumps(w.get("reference_images", [])),
            media_url=w["media_url"],
            thumb_url=w["thumb_url"],
            poster_url=w.get("poster_url"),
            width=w["width"],
            height=w["height"],
            duration_seconds=w.get("duration_seconds"),
            storage_backend="demo",  # 种子标记：与真实 chevereto 数据区分（DESIGN 7.2）
            external_file_id=w["external_file_id"],
            album_id=album_ids.get(w["album_slug"]) if w.get("album_slug") else None,
            featured=1 if w.get("featured") else 0,
            visibility=w.get("visibility", "public"),
            source_meta=_dumps(w.get("source_meta", {"seed": "demo"})),
            created_at=w["published_at"],
            published_at=w["published_at"],
            updated_at=w["published_at"],
        )
        session.add(work)
        session.flush()
        for slug in w.get("tag_slugs", []):
            work.tags.append(tag_objs[slug])

    session.commit()
    return True


def _dumps(obj) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)


def main() -> None:
    """python -m app.seed：entrypoint 在 alembic upgrade 后调用。"""
    settings: Settings = load_settings()
    if not settings.seed_demo:
        print("[seed] SEED_DEMO=false，跳过")
        return
    engine = make_engine(settings.database_url)
    factory = make_session_factory(engine)
    with factory() as session:
        seeded = run_seed(session)
    print(f"[seed] {'已写入演示种子数据' if seeded else 'works 非空，跳过（幂等）'}")


if __name__ == "__main__":
    main()
