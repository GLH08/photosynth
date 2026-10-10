"""initial schema: works / albums / tags / work_tags / import_jobs (DESIGN 第 2 章)

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "albums",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("slug", sa.Text(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False, server_default="mixed"),
        sa.Column("sort_weight", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("external_ref", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.Text(), nullable=False),
        sa.CheckConstraint("kind IN ('image','video','mixed')", name="ck_albums_kind"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column("slug", sa.Text(), nullable=False, unique=True),
        sa.Column("created_at", sa.Text(), nullable=False),
    )

    op.create_table(
        "works",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("negative_prompt", sa.Text(), nullable=True),
        sa.Column("model_name", sa.Text(), nullable=False, server_default=""),
        sa.Column("model_version", sa.Text(), nullable=True),
        sa.Column("parameters", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("reference_images", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("media_url", sa.Text(), nullable=False),
        sa.Column("thumb_url", sa.Text(), nullable=False),
        sa.Column("poster_url", sa.Text(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("storage_backend", sa.Text(), nullable=False, server_default="chevereto"),
        sa.Column("external_file_id", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=True),
        sa.Column(
            "album_id",
            sa.Text(),
            sa.ForeignKey("albums.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("featured", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("visibility", sa.Text(), nullable=False, server_default="public"),
        sa.Column("sort_weight", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_meta", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("published_at", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.Text(), nullable=False),
        sa.CheckConstraint("type IN ('image','video')", name="ck_works_type"),
        sa.CheckConstraint("width > 0", name="ck_works_width_positive"),
        sa.CheckConstraint("height > 0", name="ck_works_height_positive"),
        sa.CheckConstraint("featured IN (0,1)", name="ck_works_featured_bool"),
        sa.CheckConstraint(
            "visibility IN ('public','unlisted','hidden')", name="ck_works_visibility"
        ),
        sa.CheckConstraint(
            "type <> 'video' OR (poster_url IS NOT NULL AND duration_seconds IS NOT NULL)",
            name="ck_works_video_complete",
        ),
        sa.CheckConstraint(
            "type <> 'image' OR (poster_url IS NULL AND duration_seconds IS NULL)",
            name="ck_works_image_no_poster",
        ),
    )
    # 幂等导入唯一键（坑 #6）+ 主列表/专辑/精选/哈希索引
    op.create_index(
        "uq_works_external_file", "works", ["storage_backend", "external_file_id"], unique=True
    )
    op.create_index(
        "idx_works_list",
        "works",
        ["visibility", "type", sa.text("published_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "idx_works_album", "works", ["album_id", "visibility", sa.text("published_at DESC")]
    )
    op.create_index("idx_works_featured", "works", ["featured", sa.text("published_at DESC")])
    op.create_index("idx_works_hash", "works", ["content_hash"])

    op.create_table(
        "work_tags",
        sa.Column(
            "work_id",
            sa.Text(),
            sa.ForeignKey("works.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.Text(),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("idx_work_tags_tag", "work_tags", ["tag_id"])

    # 批量收录任务表（DESIGN 2.5，本期预留不启用）
    op.create_table(
        "import_jobs",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_ref", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("imported", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uncertain", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("started_at", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','running','success','partial','failed')",
            name="ck_import_jobs_status",
        ),
    )


def downgrade() -> None:
    op.drop_table("import_jobs")
    op.drop_index("idx_work_tags_tag", table_name="work_tags")
    op.drop_table("work_tags")
    op.drop_index("idx_works_hash", table_name="works")
    op.drop_index("idx_works_featured", table_name="works")
    op.drop_index("idx_works_album", table_name="works")
    op.drop_index("idx_works_list", table_name="works")
    op.drop_index("uq_works_external_file", table_name="works")
    op.drop_table("works")
    op.drop_table("tags")
    op.drop_table("albums")
