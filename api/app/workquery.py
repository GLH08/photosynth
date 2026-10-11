"""作品查询基底（Build-G 回收站）：统一排除已软删除（deleted_at IS NOT NULL）。

公开列表 / 专辑内作品 / 搜索 / 统计 / 管理列表 / 详情 / 媒体全部经此过滤，
避免每处手写 `deleted_at IS NULL`。回收站（/api/admin/trash）与 restore/purge
显式绕过本过滤，按需读取已删除行。
"""
from __future__ import annotations

from sqlalchemy import ColumnElement

from .models import Work


def work_is_active() -> ColumnElement[bool]:
    """未进回收站的作品：deleted_at IS NULL。"""
    return Work.deleted_at.is_(None)
