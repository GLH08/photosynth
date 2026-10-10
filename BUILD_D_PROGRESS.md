# Build-D 进度（全站登录保护 + 移除发布流 + 移动端适配 + 字体自动化，断点续跑用）

格式：时间 | 内容 | 状态

- 2026-10-10 17:20 | 计划落盘（本文件创建）；基线：web 无 middleware（仅 /admin/* 有 requireAdminGate）、visibility 贯穿前后端、字体已在库但需手动放置 | ✅
- 2026-10-10 19:45 | 【4】字体自动化：新增 web/scripts/fetch-fonts.mjs（缺失则 jsDelivr 下载 + wOF2 校验，已有跳过，curl 优先/fetch 回退——实测本机 Node 直连超时而 curl 通）；package.json 接 prebuild 钩子；更新 web/fonts/README.md 与 README 部署说明 | ✅
- 2026-10-10 20:30 | 【2】移除发布流（后端彻底移除）：Alembic 0002_remove_visibility（DROP 列+重建索引，升级/回滚已验）；models/schemas/serializers/admin+public 路由/种子去 visibility；publish/unpublish 端点删除；测试同步（37 个全过） | ✅
- 2026-10-10 20:35 | 【2】移除发布流（前端）：WorkForm 去 visibility 字段；AdminWorksClient 去 tabs/上架下架按钮/可见性列/统计；WorkDetailPanel 去复制链接+unlisted 徽章；types/api 收敛；tsc 通过 | ✅
- 2026-10-10 20:40 | 【1】全站登录保护：新增 web/middleware.ts（放行 login/logout/health/_next/favicon，其余 Cookie 直连后端校验，401/403 页面 307 跳 ?next=、API 401 JSON）；LoginForm 跳回 next（同站白名单）+登录页 Suspense；admin 三客户端 401 带 next；tsc 通过 | ✅
- 2026-10-10 21:30 | 【3】移动端适配：390px 截图走查（首页/画廊/视频/管理/表单/lightbox，无横向溢出）；修复管理台窄屏顶栏（logo 隐藏、链接不换行）与作品表 min-width 横滑；lightbox 底部弹窗已适配 | ✅
