"""add deleted_at: works.deleted_at 支持回收站（软删除）。

背景（Build-G）：作品删除从物理删除改为软删除（deleted_at = 删除时间），
误删可恢复；唯一索引 uq_works_external_file 仍覆盖已删除行，故重新导入同一
external_file_id 不会撞唯一键。查询侧由 app.workquery.work_is_active() 统一过滤。

新增可空列在 SQLite / Postgres 均支持原生 ADD COLUMN，无需 batch 重建表
（避开 0002 记录的表达式索引复制坑）。

Revision ID: 0004_add_deleted_at
Revises: 0003_sort_by_created_at
Create Date: 2026-10-11
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_add_deleted_at"
down_revision = "0003_sort_by_created_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("works", sa.Column("deleted_at", sa.Text(), nullable=True))
    op.create_index("idx_works_deleted", "works", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("idx_works_deleted", table_name="works")
    op.drop_column("works", "deleted_at")
