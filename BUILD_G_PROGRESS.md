# Build-G 进度（回收站/软删除，断点续跑用）

格式：时间 | 内容 | 状态

## 计划
1. 【后端】migration 0004：works.deleted_at（TEXT nullable，默认 NULL）+ 索引；model 加字段。
2. 【后端】统一查询基底排除回收站：新建 app/workquery.py（work_is_active()），公开列表/专辑/搜索/统计/管理列表/详情/媒体统一切入。
3. 【后端】admin：delete_work 改软删除；新增 GET /trash（deleted_at 倒序分页）、POST /works/{id}/restore（幂等，404）、DELETE /works/{id}/purge（物理删）。
4. 【后端】序列化补 deleted_at（admin）；补 pytest 用例（删除→列表查不到/trash 可见/restore 回来/purge 彻底没）。
5. 【前端】types/api 加 deleted_at、getTrash/restoreWork/purgeWork；删除文案改「移入回收站」+ toast。
6. 【前端】新建 /trash 页（缩略图+标题+删除时间，恢复/彻底删除二次确认）；加回收站入口 + 数量 badge。
7. 【验证】pytest 全过、npx tsc --noEmit、npm run build。

- 2026-10-11 | 计划落盘（本文件创建）；基线：pytest 51 passed | ✅
- 2026-10-11 | 【后端】admin.py：delete_work 改软删除（deleted_at=utcnow、updated_at 同步、行与 work_tags 保留）；新增 GET /trash（limit/offset，deleted_at+id 倒序，返回 total/has_more）、POST /works/{id}/restore（include_deleted 查，不存在 404，幂等）、DELETE /works/{id}/purge（物理删，不存在 404）；admin 列表与 stats 接 work_is_active | ✅
- 2026-10-11 | 【后端】public.py：_filter_conditions 基底加 work_is_active（覆盖列表/专辑/搜索/详情邻接）；albums work_count、/tags count（outerjoin 条件）、/stats 计数、/media 代理全部排除回收站 | ✅
- 2026-10-11 | 【测试】更新 test_delete_work（旧断言「work_tags 物理清零」已随语义变更失效，改为软删除：行/关联保留 + deleted_at 已置）；新增 tests/test_trash.py 5 例（公开隐藏、restore、purge、分页倒序、restore/purge CSRF 403） | ✅
- 2026-10-11 | 【前端】types.ts：WorkListItem.deleted_at?、TrashPage；api.ts：getTrash/restoreWork/purgeWork（同源代理 + CSRF）；WorkManageButtons 文案改「移入回收站」+ toast「已移入回收站…可在回收站恢复」 | ✅
- 2026-10-11 | 【前端】新建 components/TrashClient.tsx + app/trash/page.tsx（缩略图+标题+删除时间，恢复/彻底删除二次确认，offset 加载更多，窄屏换行）+ components/TrashLink.tsx（页脚入口 + 数量 badge，登录可见，401 静默隐藏）+ globals.css 样式 | ✅
- 2026-10-11 | 【验证】pytest 56 passed（51→56，新增 5 例）、npx tsc --noEmit 0 error、npm run build 成功（/trash 路由 3.99 kB） | ✅
