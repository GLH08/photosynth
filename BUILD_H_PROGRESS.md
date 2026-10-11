# Build-H 进度（精选快捷切换 + 批量操作，断点续跑用）

格式：时间 | 内容 | 状态

## 计划
1. 【后端】schemas.py 加 WorkBatch（ids/op/album_slug/tag_slugs）；admin.py 加 PATCH /api/admin/works/batch（注册在 /works/{id} 之前，避免路径吞掉），逐条处理返回 {ok, failed}。
2. 【后端】新增 tests/test_batch.py（各 op + failed + CSRF + 校验）。
3. 【前端】types.ts/api.ts：BatchOp/BatchResult/batchWorks、toggleFeatured。
4. 【前端】QuickFeatureButton 组件；MasonryCard（卡片右上角管理浮层）+ WorkDetailPanel（详情操作区）接入，即点即切换 + toast + 即时更新 ★。
5. 【前端】BatchToolbar 组件（已选数 + 操作按钮）；FilterBar 加「批量选择」入口；GalleryClient 选择模式（点选/长按进入/全选）+ 批量 op + 本地列表即时更新。
6. 【前端】TrashClient 选择模式（批量恢复 / 批量彻底删除二次确认）。
7. 【前端】globals.css 样式（卡片选中态/勾选框/批量工具条/精选按钮）。
8. 【验证】pytest 全过、npx tsc --noEmit、npm run build。

- 2026-10-11 | 计划落盘（本文件创建）；基线：pytest 56 passed | ✅
- 2026-10-11 | 【后端】schemas.py：WorkBatch（ids min1/max1000、op Literal 七选一、album_slug、tag_slugs）；admin.py：PATCH /api/admin/works/batch（注册在 /works/{id} 之前避免被吞），逐条独立处理：trash/restore/purge/featured/unfeatured/move_album/add_tags，返回 {ok, failed:[{id,reason}]}；op 级参数（缺 album_slug / tag_slugs）整体 422，专辑不存在整体 404；加标签延迟建标签避免孤儿 | ✅
- 2026-10-11 | 【测试】新增 tests/test_batch.py 6 例（精选开关、回收站三态+重复 trash 计失败、移入专辑+参数非法、加标签追加不覆盖+幂等、部分失败隔离+空 ids/非法 op、CSRF 403）；pytest 62 passed（56→62） | ✅
- 2026-10-11 | 【前端】QuickFeatureButton 组件（卡片右上角 ★/☆，即点即切换 + toast）；MasonryCard/MasonryGrid/WorkDetailPanel/WorkDialog/WorkPageBody 接入 onFeaturedChange | ✅
- 2026-10-11 | 【前端】BatchToolbar 组件 + FilterBar「批量选择」入口 + GalleryClient 选择模式（点选/长按进入/全选/清空）+ runBatch（7 种 op，本地即时更新）| ✅
- 2026-10-11 | 【补完】GalleryClient 接 BatchToolbar 渲染 + FilterBar selectMode props + WorkDialog onFeaturedChange（上一轮未接完）| ✅
- 2026-10-11 | 【验证】pytest 62 passed、tsc clean、npm run build 通过 | ✅
