# Build-E 进度（大改：分页/前后台合并/视频表单/筛选搜索/查漏，断点续跑用）

格式：时间 | 内容 | 状态

- 2026-10-10 22:00 | 计划落盘（本文件创建）；基线：pytest 37 passed、tsc clean；已通读前后端关键文件 | ✅
- 2026-10-10 22:25 | 【1】分页/排序：复现脚本确认 1400 条同时间戳+600 条 published_at NULL 只加载 800 条且顺序错（根因：排序键 published_at 可空，NULL 行被 cursor 条件静默过滤）；后端排序键 published_at→created_at（public.py encode/order/neighbors + models 索引 + 0003 迁移），加 3 个回归测试；前端 GalleryClient 单飞竞态修复（seq 空转丢响应）+ 底部「已加载 N / 共 M」；pytest 40 passed | ✅
- 2026-10-10 22:29 | 【2】前后台合并收尾：/albums 接 AlbumCreateButton + AlbumManageSlot（卡下管理行，兄弟节点避嵌套 Link）/ /tags 接 TagCreateButton + TagManageSlot（hover 现重命名/删除）；Slot 按 slug 查 admin 列表补 id（公开字典无 id 且测试锁定字段集）；删 lib/admin.ts + AdminWorks* 类型/查询/M6 CSS 死区与 footer 管理入口；tsc clean、pytest 40 passed | ✅
- 2026-10-10 23:05 | 【4】后端真实比例：补 _RATIO_TARGETS 定义（16:9/9:16/1:1/4:3/3:4/3:2/2:3/4:5），修复 _ratio_condition 引用未定义变量的 NameError（上一会话遗留）；冒烟验证条件构造正常 | ✅
- 2026-10-10 23:35 | 【3】视频登记表单类型感知重排：基本信息模型名前置；视频规格区（比例下拉 16:9/9:16/1:1/4:3/3:4/3:2/2:3/4:5，切换按宽/高换算+时长）→ 提示词 → 首帧/尾帧 URL（role=first/last）→ 其他参考图（无 role）→ 缩略图/封面/媒体 URL/参数 JSON 专属段；图片态字段合理化（媒体区仅图片项、参数区图片专属）；编辑态按 role 回填首/尾帧；pytest 41 passed、tsc clean | ✅
- 2026-10-10 23:40 | 【4】前端筛选与搜索收尾：FilterBar/parseFilters/RatioBucket 真实比例 8 值已在上一会话就绪（本轮确认）；搜索回车无反应修复——Header 已改整页跳转（保证 SSR 按 q 取数）+ GalleryClient 加 extKey 同步 effect（router.push 同路由兜底）；搜索框按页面限定（/videos→/videos，其余→/gallery）已在上一会话就绪（本轮确认） | ✅
- 2026-10-10 23:55 | 【5】全量验证：pytest 41 passed、tsc clean、npm run build 通过；临时库 1400 条图片+1 条 role 视频：30 页翻页 loaded=1400 unique=1400 稳定，8 比例各 175，图片搜索 q→1、视频 q=waves→1；curl 未登录 / 与 /gallery→307（next=/）、/api/works→401；登录后 SSR 管理按钮可见（新建1/编辑48/删除49）；搜索/比例 SSR 计数正确（1 幅/175 幅/1 条）；临时库与服务已清理 | ✅
