"""sort by created_at: 公开列表排序键 published_at(可空) → created_at(非空)。

背景（Build-E【1】）：批量导入行 published_at 可能为 NULL（历史/外部导入
缺失值）；ORDER BY published_at DESC + cursor 比较遇 NULL 恒为 NULL，
这些行被静默过滤 → 「显示已加载全部 N 幅实际只有零头」（线上 1385→26 的
同类根因之一）。created_at 非空且登记时 = published_at，排序稳定且覆盖全量。

Revision ID: 0003_sort_by_created_at
Revises: 0002_remove_visibility
Create Date: 2026-10-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_sort_by_created_at"
down_revision = "0002_remove_visibility"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("idx_works_list", table_name="works")
    op.drop_index("idx_works_album", table_name="works")
    op.drop_index("idx_works_featured", table_name="works")
    op.create_index(
        "idx_works_list",
        "works",
        ["type", sa.text("created_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "idx_works_album", "works", ["album_id", sa.text("created_at DESC")]
    )
    op.create_index(
        "idx_works_featured", "works", ["featured", sa.text("created_at DESC")]
    )


def downgrade() -> None:
    op.drop_index("idx_works_featured", table_name="works")
    op.drop_index("idx_works_album", table_name="works")
    op.drop_index("idx_works_list", table_name="works")
    op.create_index(
        "idx_works_list",
        "works",
        ["type", sa.text("published_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "idx_works_album", "works", ["album_id", sa.text("published_at DESC")]
    )
    op.create_index(
        "idx_works_featured", "works", ["featured", sa.text("published_at DESC")]
    )
