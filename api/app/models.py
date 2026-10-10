"""数据模型：DESIGN 第 2 章 DDL 全量落地（works/albums/tags/work_tags/import_jobs）。

约定：JSON 字段以 TEXT 存储、应用层序列化（Postgres 兼容）；时间一律 UTC ISO8601 TEXT；
枚举用 CHECK 约束；幂等唯一索引 uq_works_external_file。
"""
from __future__ import annotations

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Work(Base):
    __tablename__ = "works"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # nanoid 短 ID
    type: Mapped[str] = mapped_column(Text, nullable=False)  # image / video
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    model_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_version: Mapped[str | None] = mapped_column(Text, nullable=True)

    parameters: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON 对象
    reference_images: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON 数组

    media_url: Mapped[str] = mapped_column(Text, nullable=False)
    thumb_url: Mapped[str] = mapped_column(Text, nullable=False)
    poster_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    storage_backend: Mapped[str] = mapped_column(Text, nullable=False, default="chevereto")
    external_file_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(Text, nullable=True)

    album_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("albums.id", ondelete="SET NULL"), nullable=True
    )
    featured: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    source_meta: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON

    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    published_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    album: Mapped["Album | None"] = relationship(back_populates="works")
    tags: Mapped[list["Tag"]] = relationship(
        secondary="work_tags", back_populates="works", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint("type IN ('image','video')", name="ck_works_type"),
        CheckConstraint("width > 0", name="ck_works_width_positive"),
        CheckConstraint("height > 0", name="ck_works_height_positive"),
        CheckConstraint("featured IN (0,1)", name="ck_works_featured_bool"),
        # 视频完整性约束：视频必须有封面帧与时长；图片必须没有
        CheckConstraint(
            "type <> 'video' OR (poster_url IS NOT NULL AND duration_seconds IS NOT NULL)",
            name="ck_works_video_complete",
        ),
        CheckConstraint(
            "type <> 'image' OR (poster_url IS NULL AND duration_seconds IS NULL)",
            name="ck_works_image_no_poster",
        ),
        Index("uq_works_external_file", "storage_backend", "external_file_id", unique=True),
        Index(
            "idx_works_list",
            "type",
            text("published_at DESC"),
            text("id DESC"),
        ),
        Index("idx_works_album", "album_id", text("published_at DESC")),
        Index("idx_works_featured", "featured", text("published_at DESC")),
        Index("idx_works_hash", "content_hash"),
    )


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False, default="mixed")
    sort_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    external_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    works: Mapped[list[Work]] = relationship(back_populates="album", passive_deletes=True)

    __table_args__ = (
        CheckConstraint("kind IN ('image','video','mixed')", name="ck_albums_kind"),
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    works: Mapped[list[Work]] = relationship(
        secondary="work_tags", back_populates="tags", passive_deletes=True
    )


class WorkTag(Base):
    __tablename__ = "work_tags"

    work_id: Mapped[str] = mapped_column(
        Text, ForeignKey("works.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(
        Text, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (Index("idx_work_tags_tag", "tag_id"),)


class ImportJob(Base):
    """批量收录任务（DESIGN 2.5，本期预留不启用）。"""

    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uncertain: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    finished_at: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','running','success','partial','failed')",
            name="ck_import_jobs_status",
        ),
    )
