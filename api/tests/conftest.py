"""pytest 全局环境：临时 SQLite + alembic upgrade head（顺带验证迁移可执行）。

必须在 import app.* 之前设置环境变量（config 在导入期读取并校验）。
"""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile

import sqlalchemy as sa

API_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

TEST_DIR = pathlib.Path(tempfile.mkdtemp(prefix="gallery-test-", dir="/tmp/opencode"))

ADMIN_TOKEN = "test-admin-token-Xk92mQ"
os.environ["ADMIN_TOKEN"] = ADMIN_TOKEN
os.environ["SESSION_SECRET"] = "unit-test-session-secret-0123456789abcdef"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DIR}/test.db"
os.environ["SEED_DEMO"] = "false"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

_cfg = Config(str(API_ROOT / "alembic.ini"))
_cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
command.upgrade(_cfg, "head")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import auth  # noqa: E402
from app.main import app  # noqa: E402

BEARER = {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture(autouse=True)
def _clean_state():
    """每个用例前后清空业务表并重置登录限速表（避免 60s/10 次限速串扰）。"""
    auth._login_attempts.clear()

    def truncate() -> None:
        with app.state.session_factory() as s:
            for table in ("work_tags", "works", "tags", "albums", "import_jobs"):
                s.execute(sa.text(f"DELETE FROM {table}"))
            s.commit()

    truncate()
    yield
    truncate()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin(client: TestClient) -> TestClient:
    """已完成 Cookie 登录的客户端。"""
    r = client.post("/api/admin/login", json={"token": ADMIN_TOKEN})
    assert r.status_code == 200, r.text
    return client


def image_payload(**overrides) -> dict:
    base = {
        "type": "image",
        "title": "霓虹雨巷",
        "prompt": "cyberpunk alley in heavy rain, neon reflections",
        "media_url": "https://cdn.example.com/i/a1b2c3.png",
        "thumb_url": "https://cdn.example.com/i/a1b2c3.th.png",
        "width": 1024,
        "height": 1536,
        "storage_backend": "chevereto",
        "external_file_id": "x9Kd2",
        "parameters": {"size": "1024x1536", "seed": 421087},
        "tag_slugs": ["cyberpunk"],
    }
    base.update(overrides)
    return base


def video_payload(**overrides) -> dict:
    base = {
        "type": "video",
        "title": "海浪拍打礁石",
        "prompt": "ocean waves crashing on rocks at sunset",
        "media_url": "https://cdn.example.com/v/waves.mp4",
        "thumb_url": "https://cdn.example.com/v/waves.th.jpg",
        "poster_url": "https://cdn.example.com/v/waves.frame.jpg",
        "width": 1920,
        "height": 1080,
        "duration_seconds": 6.2,
        "storage_backend": "chevereto",
        "external_file_id": "vW3kP",
    }
    base.update(overrides)
    return base
