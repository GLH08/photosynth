"""标题自然排序键（Build-F【1】）。

「按名称」排序需要 hy-1 < hy-2 < … < hy-10（而不是字典序 hy-1 < hy-10 < hy-2）。
SQL 无法直接做自然排序，这里用一个**确定性**纯函数生成可比较的字符串键：

- 数字段右对齐补零到 20 位（"1"→"000…001"、"10"→"000…010"），消除位数差异；
- 数字段前缀 \\x01 分隔符（保证 "a" 排在 "a1" 之前）；
- 大小写归一为小写；非数字段原样保留（中文按码点序，确定性但不等于拼音序，见报告）。

该函数同时用于：
1) 注册为 SQLite 用户函数 `natural_sort_key()`，供 ORDER BY / cursor 比较（见 db.py）；
2) 生成 cursor 载荷与 Python 侧的邻居查询键。
两处共用同一实现，保证 SQL 侧与 Python 侧排序完全一致。
"""
from __future__ import annotations

import re

_SPLIT = re.compile(r"(\d+)")
_PAD = 20
_SEP = "\x01"  # 小于任何数字/字母，数字段前缀


def natural_sort_key(text: str | None) -> str:
    if not text:
        return ""
    parts: list[str] = []
    for seg in _SPLIT.split(text.strip().lower()):
        if not seg:
            continue
        if seg.isdigit():
            parts.append(_SEP + seg[-_PAD:].rjust(_PAD, "0"))
        else:
            parts.append(seg)
    return "".join(parts)
