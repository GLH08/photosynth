# 光合画廊 Photosynth

AI 生成作品陈列馆 —— 图片与视频展示平台。媒体是唯一主角，界面安静退后。

设计语言：**晨雾画廊 Morning Gallery**（亮色、纸白底、钴蓝点缀）。

## 快速启动（Docker Compose）

```bash
cd gallery
cp api/.env.example api/.env   # 填入 ADMIN_TOKEN（≥16 位随机字符串）与 SESSION_SECRET
docker compose up -d --build
```

- 前台：http://localhost:3000（首页 / 图片 /gallery / 视频 /videos / 专辑 /albums / 标签 /tags）
- 管理台：http://localhost:3000/admin/login（用 ADMIN_TOKEN 登录）
- 后端 API：http://localhost:8000（仅回环，供 web 容器同源代理）

数据（SQLite）在 `gallery/data/`（已 gitignore），随卷持久化。

## 本地开发（不走 Docker）

```bash
# 后端
cd gallery/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
ADMIN_TOKEN=<你的令牌> SESSION_SECRET=<32位以上随机> DATABASE_URL="sqlite:////home/hatch/workspace/ai-showcase/gallery/data/gallery.db" \
  .venv/bin/python -m uvicorn app.main:app --port 8000

# 前端
cd gallery/web && npm ci && npm run dev   # 或 npm run build && BACKEND_ORIGIN=http://127.0.0.1:8000 npm start
```

字体（Noto Sans SC woff2 400/500/700）无需手动放置：`npm run build` 前的 `prebuild`
钩子会自动检查 `web/fonts/`，缺失则从 jsDelivr fontsource CDN 下载并校验 `wOF2`
文件头（详见 `web/fonts/README.md`；Docker 构建同样生效，需构建期可访问 jsDelivr）。

## 功能一览

- **首页 /**：Hero + 统计条 + 精选作品横滑 + 专辑入口
- **图片 /gallery**：无裁剪瀑布流（按真实宽高比排列）、筛选 chips（比例/专辑/标签/精选/搜索）、无限加载、Lightbox（URL 同步、可复制提示词、参考图、参数表）
- **视频 /videos**：同上筛选模型 + 海报网格 + 时长徽章；点击弹窗 `<video controls preload="metadata" poster>` 播放
- **专辑 /albums**：封面卡片（自定义封面或首张作品缩略图）+ 详情页（masonry|video 网格）
- **标签 /tags**：热度标签云（字号/色深随作品数）+ 聚合页
- **作品页 /works/[id]**：SSR + OG/JSON-LD（视频为 og:type=video.other）
- **管理台 /admin**：令牌登录（HttpOnly Cookie，7 天，限速 60 秒/10 次）→ 作品表（tabs/搜索/cursor 分页/行内上下架/删除二次确认）→ 登记表单（URL https 校验、参数 JSON、参考图有序列表）→ 专辑/标签 CRUD（slug 自动生成）
- **安全**：nosniff / Referrer-Policy / frame-ancestors 'self'；管理 API 全部经同源代理

## 数据模型要点

- 媒体文件**不存项目**：只存 `media_url` / `thumb_url` / `poster_url`（外部图床/网盘），`/api/media/{id}` 302 跳转
- 作品三态可见性：`listed`（公开）/ `unlisted`（详情可访问）/ `hidden`（仅管理可见）
- 图片与视频共用一套元数据模型（prompt / 参考图 / 模型 / parameters JSON），视频多 `duration`
- 种子数据：12 图 + 2 视频（picsum 占位，可替换）

## 验证记录（2026-10-10）

- 后端：`pytest` → 37 passed
- 前端：`tsc --noEmit` 通过；`next build` 成功（/ /gallery /videos /albums /albums/[slug] /tags /tags/[slug] /works/[id] /admin/*）
- 本地走查：/videos /albums /tags / → 200；/admin 未登录 → 307 → /admin/login；登录 → 200 → /admin 200
- 截图验收：视频页/首页/专辑/标签/登录/管理台 桌面 1440px 全部通过
- Docker：本机无 Docker，仅校验 compose YAML 解析与 Dockerfile 结构；容器实际启动未验证

## 目录

```
gallery/
  api/            FastAPI（SQLAlchemy 2 + Alembic + SQLite WAL）
  web/            Next.js 15 + React 19 + TypeScript（Noto Sans SC 自托管）
  docker-compose.yml
  data/           SQLite 数据文件（gitignore）
  ANALYSIS.md / DESIGN.md 见上级目录（~/workspace/ai-showcase/）
```
