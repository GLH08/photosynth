# Build-C 进度（M5 + M6，断点续跑用）

格式：时间 | 内容 | 状态

- 2026-10-10 16:05 | 基线自检：tsc --noEmit 通过（上轮改过的 6 个文件无 break）；pytest 37 passed | ✅
- 2026-10-10 16:05 | 计划落盘（本文件创建） | ✅
- 2026-10-10 16:12 | 基础层：lib/types.ts 管理端类型、lib/api.ts（clientSend/listUrlFromFilters/getAlbumPage）、lib/admin.ts（SSR Cookie 门禁）；组件泛化：MasonryCard poster 回退链、FilterBar hideAlbum/hideTags、GalleryClient 多形态（video/grid/锁定筛选）、VideoGridSkeleton、EmptyState 自定义文案；tsc 通过 | ✅
- 2026-10-10 16:20 | /videos 视频画廊页（VideoCard 网格 + 时长徽章 + FilterBar 复用）+ video-grid CSS | ✅
- 2026-10-10 16:24 | / 首页重做：Hero 晨雾渐变 + stats 条 + FeaturedRail 精选横滑 + AlbumCard 专辑入口 + 双 CTA；新增 FeaturedRail/AlbumCard 组件与 resolveAlbumCovers | ✅
- 2026-10-10 16:32 | /albums + /albums/[slug]（封面兜底/kind 徽章/masonry|video 网格/锁定专辑筛选/404 与降级壳） | ✅
- 2026-10-10 16:36 | /tags 标签云（热度→字号/色深）+ /tags/[slug] 聚合页（锁定标签筛选）；tsc 通过 | ✅
- 2026-10-10 16:50 | M6 管理台：AdminShell 侧栏外壳、/admin/login（token→Cookie+toast）、/admin 作品表（tabs/搜索/cursor 分页/行内编辑/上下架/删除二次确认）、/admin/works/new 登记表单（URL 即时 https 校验/参数 JSON/参考图有序列表）、/admin/collections（专辑标签 CRUD + slug 自动生成） | ✅
- 2026-10-10 16:55 | 打磨：not-found.tsx 晨雾 404、next.config 安全头（nosniff/Referrer-Policy/frame-ancestors）、WorkDialog focus trap + 焦点归还、管理台/登录/表单/404 全套 CSS；tsc 通过 | ✅
