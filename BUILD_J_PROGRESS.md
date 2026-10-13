# Build-J 进度（退出按钮 + 旧会话引导重登，断点续跑用）

格式：时间 | 内容 | 状态

## 计划
1. 【api】clientSend 旧会话出路：写请求（POST/PATCH/PUT/DELETE，除 /api/admin/login、/api/admin/logout）
   若读不到 gal_csrf → 不发请求，window.location.assign 整页跳 `/admin/login?next=<pathname+search>`，
   并抛 ApiClientError(401, "session_stale")；SSR（document 未定义）不崩。
2. 【Header】SiteHeader 加「退出」按钮：桌面端导航右侧 + 移动端抽屉；经 clientSend POST /api/admin/logout，
   成功 → router.replace(/admin/login) + router.refresh()；失败 toast、停留原页。
3. 【CSS】复用/清理残留 .admin-logout 样式，保持毛玻璃白 Header 风格与按钮视觉一致。
4. 【调用方】检查全部 clientSend 调用方，401/重登路径一致、无重复跳转、无死循环；LoginForm 语义不变。
5. 【验证】tsc --noEmit、npm run build、api pytest -q、grep 写请求 fetch。

- 2026-10-13 | 计划落盘；已读 api.ts / SiteHeader.tsx / LoginForm.tsx / globals.css / 全部 clientSend 调用方 | ✅
- 2026-10-13 | 【api】clientSend 加旧会话出路：无 gal_csrf 的写请求不发出、整页跳 /admin/login?next=<path+search>、抛 401 session_stale；新增 isStaleSession 助手；login/logout 豁免；SSR 不触发 | ✅
- 2026-10-13 | 【Header】SiteHeader 加「退出」按钮（桌面 header-actions + 移动抽屉），clientSend POST logout → router.replace(/admin/login)+refresh；失败 toast | ✅
- 2026-10-13 | 【CSS】扩展残留 .admin-logout（cursor/disabled）+ 新增 .header-logout 桌面可见、<768 隐藏 | ✅
- 2026-10-13 | 【调用方】WorkForm/WorkManageButtons/QuickFeatureButton/CollectionManage/TrashClient/GalleryClient 的 401 分支遇 session_stale 跳过二次跳转 | ✅
- 2026-10-13 | 【验证】cd web && npx tsc --noEmit 通过（exit 0） | ✅
- 2026-10-13 | 【验证】cd web && npm run build 通过（Compiled successfully，11/11 页） | ✅
- 2026-10-13 | 【验证】cd api && .venv/bin/pytest -q → 62 passed, 1 warning（后端未改动） | ✅
- 2026-10-13 | 【验证】grep 写请求 fetch：仅 clientSend/代理 route.ts/middleware 服务端 fetch；HealthBadge 为 GET，无绕过 | ✅
- 2026-10-13 | 【验证】临时自检 node --experimental-transform-types /tmp/opencode/check-clientsend.ts → 13 passed（旧会话不发请求/跳转+401、csrf 带头发送、login/logout 豁免、SSR 不崩） | ✅
