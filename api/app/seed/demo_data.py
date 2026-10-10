"""演示种子数据（DESIGN 7.2）：2 专辑 + 6 标签 + 12 图 + 2 视频（无发布流，全量可见）。

图片一律 picsum.photos 固定 ID + 显式宽高（URL 即真实尺寸）；
thumb_url 用同 ID 小尺寸变体（宽 480），模拟真实缩略图链路。
比例刻意混排（3:2 / 3:4 / 1:1 / 12:5 / 2:3 / 16:9 / 4:5），是瀑布流保全貌的活体验收用例。
"""
from __future__ import annotations

DEMO_ALBUMS = [
    {
        "slug": "city-impressions",
        "name": "城市印象",
        "description": "街头、天际线与光轨中的城市切片。",
        "kind": "image",
        "sort_weight": 20,
    },
    {
        "slug": "natural-textures",
        "name": "自然纹理",
        "description": "山谷、水流与植被的质地实验（含视频）。",
        "kind": "mixed",
        "sort_weight": 10,
    },
]

DEMO_TAGS = [
    {"slug": "city", "name": "城市"},
    {"slug": "nature", "name": "自然"},
    {"slug": "portrait", "name": "人像"},
    {"slug": "cyberpunk", "name": "赛博朋克"},
    {"slug": "long-exposure", "name": "慢门"},
    {"slug": "aerial", "name": "航拍"},
]

_MODEL = "Hy Image 3.5 Preview"
_MODEL_VERSION = "3.5-preview-0928"


def _img(pic_id: int, w: int, h: int, **kw) -> dict:
    """picsum 固定 ID：media 用全尺寸，thumb 用宽 480 等比变体。"""
    th = round(h * 480 / w)
    base = {
        "type": "image",
        "media_url": f"https://picsum.photos/id/{pic_id}/{w}/{h}",
        "thumb_url": f"https://picsum.photos/id/{pic_id}/480/{th}",
        "width": w,
        "height": h,
        "model_name": _MODEL,
        "model_version": _MODEL_VERSION,
        "external_file_id": f"demo-picsum-{pic_id}",
    }
    base.update(kw)
    base.setdefault("parameters", {"size": f"{w}x{h}", "seed": 1000 + pic_id, "steps": 30})
    return base


DEMO_WORKS: list[dict] = [
    _img(
        1015, 1600, 1067,
        title="河流山谷",
        description="晨雾中的河谷曲线。",
        prompt="aerial view of a winding river through a misty valley at dawn, soft light, high detail",
        negative_prompt="blurry, lowres, watermark",
        album_slug="natural-textures",
        tag_slugs=["nature"],
        published_at="2026-09-20T08:00:00Z",
    ),
    _img(
        1016, 1200, 1600,
        title="峡谷俯视",
        prompt="deep canyon seen from above, layered rock textures, drone photography style",
        album_slug="natural-textures",
        tag_slugs=["nature", "aerial"],
        published_at="2026-09-21T09:30:00Z",
    ),
    _img(
        1025, 1080, 1440,
        title="哈士奇肖像",
        description="图生图示例：以两张参考图约束毛色与姿态。",
        prompt="portrait of a siberian husky with ice-blue eyes, studio lighting, sharp fur detail",
        negative_prompt="deformed, extra limbs",
        tag_slugs=["portrait"],
        reference_images=[
            {"order": 1, "url": "https://picsum.photos/id/237/400/400",
             "thumb_url": "https://picsum.photos/id/237/160/160"},
            {"order": 2, "url": "https://picsum.photos/id/169/400/267",
             "thumb_url": "https://picsum.photos/id/169/160/107"},
        ],
        parameters={"size": "1080x1440", "seed": 421087, "steps": 32, "cfg_scale": 7.5,
                    "img2img_strength": 0.62},
        published_at="2026-09-22T10:10:00Z",
    ),
    _img(
        1035, 1000, 1000,
        title="山径",
        prompt="a narrow mountain trail cutting through alpine meadow, square composition",
        album_slug="city-impressions",
        tag_slugs=["city"],
        published_at="2026-09-23T07:45:00Z",
    ),
    _img(
        1043, 1920, 800,
        title="全景横幅",
        description="12:5 超宽画幅，验证瀑布流极端比例混排。",
        prompt="ultra wide panorama of a coastal city skyline at blue hour, long exposure traffic light trails",
        album_slug="city-impressions",
        tag_slugs=["city", "long-exposure"],
        parameters={"size": "1920x800", "seed": 551002, "steps": 28, "aspect_ratio": "12:5"},
        published_at="2026-09-24T18:20:00Z",
    ),
    _img(
        1044, 1067, 1600,
        title="竖构图人像",
        prompt="full body portrait in an old town alley, natural window light, film grain",
        tag_slugs=["portrait"],
        reference_images=[
            {"order": 1, "url": "https://picsum.photos/id/1027/400/600",
             "thumb_url": "https://picsum.photos/id/1027/160/240"},
        ],
        parameters={"size": "1067x1600", "seed": 991203, "steps": 28, "img2img_strength": 0.55},
        published_at="2026-09-25T11:00:00Z",
    ),
    _img(
        1050, 1600, 1067,
        title="暮色街区",
        prompt="city street at dusk, warm street lights against cold sky, cinematic color grading",
        album_slug="city-impressions",
        tag_slugs=["city"],
        featured=True,
        published_at="2026-09-27T17:40:00Z",
    ),
    _img(
        1060, 1280, 1280,
        title="静物方幅",
        prompt="minimal still life on a wooden table, soft diffused daylight, square format",
        tag_slugs=["nature"],
        published_at="2026-09-28T09:05:00Z",
    ),
    _img(
        1069, 1600, 1067,
        title="慢门水岸",
        description="featured 精选：长曝雾化水面。",
        prompt="long exposure seascape, silky water surface against rugged rocks, golden hour",
        album_slug="natural-textures",
        tag_slugs=["nature", "long-exposure"],
        featured=True,
        parameters={"size": "1600x1067", "seed": 707331, "steps": 34, "shutter": "30s"},
        published_at="2026-09-30T06:25:00Z",
    ),
    _img(
        1074, 1080, 1620,
        title="林间竖幅",
        prompt="vertical composition of a person walking through a sunlit forest path",
        tag_slugs=["portrait"],
        published_at="2026-10-01T08:30:00Z",
    ),
    _img(
        1080, 1920, 1080,
        title="天际线 16:9",
        prompt="modern skyline at night, reflections on glass facades, 16:9 cinematic frame",
        album_slug="city-impressions",
        tag_slugs=["city"],
        featured=True,
        published_at="2026-10-03T20:15:00Z",
    ),
    _img(
        1084, 1200, 1500,
        title="秋径 4:5",
        prompt="autumn forest trail with fallen leaves, warm tones, 4:5 portrait crop",
        album_slug="natural-textures",
        tag_slugs=["nature"],
        published_at="2026-10-05T07:55:00Z",
    ),
    # ---- 2 条演示视频（poster 用 picsum 帧图，媒体文件用公共 CC0 样例）----
    {
        "type": "video",
        "title": "花开延时",
        "description": "CC0 样例视频：延时摄影质感演示。",
        "prompt": "time-lapse of a flower blooming, macro lens, soft natural light",
        "model_name": "Grok Video",
        "model_version": "v1.5",
        "media_url": "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        "thumb_url": "https://picsum.photos/id/106/640/360",
        "poster_url": "https://picsum.photos/id/106/640/360",
        "width": 1280,
        "height": 720,
        "duration_seconds": 14.0,
        "parameters": {"fps": 24, "duration": 14, "aspect_ratio": "16:9"},
        "external_file_id": "demo-video-flower",
        "tag_slugs": ["nature"],
        "album_slug": "natural-textures",
        "published_at": "2026-10-06T10:00:00Z",
        "source_meta": {"seed": "demo", "license": "CC0"},
    },
    {
        "type": "video",
        "title": "城市车流（示例）",
        "description": "CC0 样例视频：夜间车流光轨演示。",
        "prompt": "night city traffic light trails, elevated highway, cinematic slow motion",
        "model_name": "Grok Video",
        "model_version": "v1.5",
        "media_url": "https://www.w3schools.com/html/mov_bbb.mp4",
        "thumb_url": "https://picsum.photos/id/1043/640/267",
        "poster_url": "https://picsum.photos/id/1043/640/267",
        "width": 1920,
        "height": 1080,
        "duration_seconds": 10.0,
        "parameters": {"fps": 24, "duration": 10, "aspect_ratio": "16:9"},
        "external_file_id": "demo-video-city-traffic",
        "tag_slugs": ["city", "long-exposure"],
        "album_slug": "city-impressions",
        "published_at": "2026-10-07T19:30:00Z",
        "source_meta": {"seed": "demo", "license": "CC0"},
    },
]
