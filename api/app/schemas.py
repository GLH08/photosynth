"""Pydantic v2 请求 schema：强校验（DESIGN 3.2 登记校验规则）。

本期 width/height 由调用方必填；服务端读文件头探测（PIL/ffprobe 流式读前 64KB）
留待后续里程碑实现（TODO: probe_media_dimensions）。
"""
from __future__ import annotations

from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator

Visibility = Literal["public", "unlisted", "hidden"]
WorkType = Literal["image", "video"]
AlbumKind = Literal["image", "video", "mixed"]

_SLUG_MAX = 120


def _require_https(value: str, field: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"{field} 必须是公网 HTTPS 地址")
    return value


class ReferenceImageIn(BaseModel):
    order: int = Field(ge=1)
    url: str
    thumb_url: str | None = None

    @field_validator("url", "thumb_url")
    @classmethod
    def _https(cls, v: str | None, info) -> str | None:  # noqa: N805
        if v is None:
            return None
        return _require_https(v, info.field_name or "url")


class WorkCreate(BaseModel):
    type: WorkType
    title: str = ""
    description: str = ""
    prompt: str = Field(min_length=1)
    negative_prompt: str | None = None
    model_name: str = ""
    model_version: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    reference_images: list[ReferenceImageIn] = Field(default_factory=list)

    media_url: str
    thumb_url: str | None = None  # 缺省 = media_url（无缩略图服务时允许，DESIGN 2.2）
    poster_url: str | None = None

    # 本期必填；缺省时服务端探测为 TODO 占位（probe_media_dimensions）
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    duration_seconds: float | None = Field(default=None, gt=0)

    storage_backend: str = Field(default="chevereto", min_length=1, max_length=64)
    external_file_id: str | None = Field(default=None, max_length=255)
    content_hash: str | None = Field(default=None, max_length=255)

    album_slug: str | None = Field(default=None, max_length=_SLUG_MAX)
    tag_slugs: list[str] = Field(default_factory=list)
    featured: bool = False
    visibility: Visibility = "public"
    sort_weight: int = 0
    source_meta: dict[str, Any] | None = None

    @field_validator("media_url", "thumb_url", "poster_url")
    @classmethod
    def _https(cls, v: str | None, info) -> str | None:  # noqa: N805
        if v is None:
            return None
        return _require_https(v, info.field_name or "url")

    @model_validator(mode="after")
    def _video_integrity(self) -> "WorkCreate":
        # 与 DB CHECK 对齐：视频必带 poster+duration；图片必须没有
        if self.type == "video" and (self.poster_url is None or self.duration_seconds is None):
            raise ValueError("type=video 时 poster_url 与 duration_seconds 必填")
        if self.type == "image" and (self.poster_url is not None or self.duration_seconds is not None):
            raise ValueError("type=image 时不得携带 poster_url / duration_seconds")
        return self


# PATCH 可变字段（部分更新，exclude_unset 语义）
class WorkUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    prompt: str | None = Field(default=None, min_length=1)
    negative_prompt: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    parameters: dict[str, Any] | None = None
    reference_images: list[ReferenceImageIn] | None = None
    media_url: str | None = None
    thumb_url: str | None = None
    poster_url: str | None = None
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    duration_seconds: float | None = Field(default=None, gt=0)
    content_hash: str | None = None
    album_slug: str | None = None  # 显式传 null 解除专辑关联
    tag_slugs: list[str] | None = None  # 全量替换；自动建缺失标签
    featured: bool | None = None
    visibility: Visibility | None = None
    sort_weight: int | None = None
    source_meta: dict[str, Any] | None = None

    @field_validator("media_url", "thumb_url", "poster_url")
    @classmethod
    def _https(cls, v: str | None, info) -> str | None:  # noqa: N805
        if v is None:
            return None
        return _require_https(v, info.field_name or "url")


class AlbumCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=_SLUG_MAX)
    name: str = Field(min_length=1)
    description: str = ""
    cover_url: str | None = None
    kind: AlbumKind = "mixed"
    sort_weight: int = 0
    external_ref: str | None = None

    @field_validator("cover_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:  # noqa: N805
        if v is None:
            return None
        return _require_https(v, "cover_url")


class AlbumUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=_SLUG_MAX)
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    cover_url: str | None = None
    kind: AlbumKind | None = None
    sort_weight: int | None = None
    external_ref: str | None = None

    @field_validator("cover_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:  # noqa: N805
        if v is None:
            return None
        return _require_https(v, "cover_url")


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=_SLUG_MAX)
    slug: str = Field(min_length=1, max_length=_SLUG_MAX)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=_SLUG_MAX)
    slug: str | None = Field(default=None, min_length=1, max_length=_SLUG_MAX)


class LoginRequest(BaseModel):
    token: str
