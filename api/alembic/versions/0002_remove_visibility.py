"""remove visibility: 个人备份不需要发布流，works.visibility 列彻底移除。

Revision ID: 0002_remove_visibility
Revises: 0001_initial
Create Date: 2026-10-10

注意：旧 idx_works_list / idx_works_album 含表达式列（published_at DESC），
SQLite batch 重建表时无法按列名复制，必须先在 batch 之外显式删掉，
batch 内只删约束 + 列，之后再建无 visibility 的新索引。
Postgres 下同序列等价于原生 ALTER。
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_remove_visibility"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("idx_works_list", table_name="works")
    op.drop_index("idx_works_album", table_name="works")
    with op.batch_alter_table("works") as batch_op:
        batch_op.drop_constraint("ck_works_visibility", type_="check")
        batch_op.drop_column("visibility")
    op.create_index(
        "idx_works_list",
        "works",
        ["type", sa.text("published_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "idx_works_album", "works", ["album_id", sa.text("published_at DESC")]
    )


def downgrade() -> None:
    op.drop_index("idx_works_list", table_name="works")
    op.drop_index("idx_works_album", table_name="works")
    with op.batch_alter_table("works") as batch_op:
        batch_op.add_column(
            sa.Column("visibility", sa.Text(), nullable=False, server_default="public")
        )
        batch_op.create_check_constraint(
            "ck_works_visibility", "visibility IN ('public','unlisted','hidden')"
        )
    op.create_index(
        "idx_works_list",
        "works",
        ["visibility", "type", sa.text("published_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "idx_works_album",
        "works",
        ["album_id", "visibility", sa.text("published_at DESC")],
    )
