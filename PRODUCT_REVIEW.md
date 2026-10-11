# 光合画廊 Photosynth —— 产品审查报告

**审查日期**：2026-10-11
**审查范围**：全栈（FastAPI + Next.js 15 + SQLite）
**审查视角**：产品经理 + 资深全栈工程师
**结论**：核心链路完整可用，但存在 3 个必须修复的安全/健壮性问题，以及多个影响"备份+参考"定位的关键功能缺失。

---

## 🔴 必须修（影响使用 / 数据安全）

### 1. ADMIN_TOKEN 无最小长度校验，8 位弱令牌可启动
- **现象**：`api/app/config.py:validate_settings()` 只检查黑名单（`changeme`/`admin` 等），不检查长度。用户当前生产令牌仅 8 位，仍可正常启动。
- **影响**：全站唯一认证凭据可被暴力破解；8 位令牌在代理日志/浏览器历史中暴露风险更高。
- **修复**：`validate_settings()` 加 `if len(s.admin_token) < 16: raise RuntimeError(...)`；生产环境立即轮换为 16+ 位随机值。

### 2. JSON-LD 存在 XSS 突破口
- **现象**：`web/app/works/[id]/page.tsx:107` 用 `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(work)) }}` 输出作品标题/描述/提示词。若其中包含 `</script>`，可跳出 script 标签执行任意 JS。
- **影响**：作品字段由用户自己录入（/new 表单），属存储型 XSS；一旦触发，可劫持全站会话 Cookie（虽为 HttpOnly，但可执行管理操作）。
- **修复**：`JSON.stringify(...).replace(/</g, "\\u003c")` 再输出；或改用 Next.js 的 `Script` 组件。

### 3. httpx 缺失已导致 API 启动崩溃（用户已本地修复，需合回 GitHub）
- **现象**：`api/app/routes/public.py:33` 顶层 `import httpx`，但 `api/requirements.txt` 一度缺失该依赖，容器启动即 `ModuleNotFoundError`。
- **影响**：生产部署直接不可用；属构建期依赖声明遗漏。
- **修复**：用户已在本地加 `httpx>=0.27`，需 `git add api/requirements.txt && git commit && git push` 合回。

### 4. 管理 API 无 CSRF 防护（Cookie 认证 + 跨站写操作）
- **现象**：`api/app/auth.py` 用 HttpOnly Cookie 认证管理路由（POST/PATCH/DELETE），但无 CSRF Token；仅依赖 `SameSite=Lax`。
- **影响**：现代浏览器下 Lax 可挡跨站 POST，但老旧浏览器/同站子域攻击仍可伪造删除/修改请求。对"删除作品不可恢复"的操作而言风险过高。
- **修复**：方案二选一：(a) 管理写操作改用 `Authorization: Bearer` 头（前端从内存取 token，不存 Cookie）；(b) 加 Double-Submit Cookie CSRF Token。推荐 (a)，与现有 Bearer 支持（`auth.py:require_admin` 已支持）对齐。

---

## 🟡 建议改（体验明显打折）

### 5. 搜索只查标题+提示词，查不到描述/模型/标签
- **现象**：`api/app/routes/public.py:_filter_conditions()` 的 `q` 条件为 `or_(Work.title.like, Work.prompt.like)`，`description`、`model_name`、标签名均不在搜索范围。
- **影响**："参考平台"定位下，用户想按模型名（如"Sora"）或标签找回作品时搜不到，反直觉。
- **修复**：`q` 条件扩展为 `or_(title, prompt, description, model_name, tags.any(name))`；注意标签 join 需去重。

### 6. 专辑封面兜底产生 N+1 请求
- **现象**：`web/lib/api.ts:resolveAlbumCovers()` 对每个无 `cover_url` 的专辑发一次 `getWorksPage({album, limit:1})`；10 个专辑 = 10 次串行/并行请求。
- **影响**：/albums 与首页专辑区首屏多出数十次请求，移动端弱网下封面久久不出来。
- **修复**：后端 `/api/albums` 直接返回 `cover_url ?? 首张作品 thumb`（`_album_public_dict` 里已有 `work_count` 查询，顺手加一个）；前端删掉 `resolveAlbumCovers`。

### 7. 视频登记表单的字段布局割裂
- **现象**：`web/components/WorkForm.tsx` 中，视频的 `media_url` 藏在下方"视频媒体与参数"区，而 `poster_url` 却在上方"媒体 URL 与尺寸"区；图片的 `media_url` 则在上方。同一概念（媒体直链）在两种类型下位置不一致。
- **影响**：用户登记视频时容易漏填 `media_url`（必填），提交时才报错，来回滚动。
- **修复**：两种类型统一顺序：媒体 URL 组（media_url → thumb_url → poster_url）→ 尺寸/时长 → 提示词 → 参考图 → 参数 → 专辑标签。

### 8. 移动端卡片管理按钮常驻，视觉噪音大
- **现象**：`web/app/globals.css:893-895` `@media (hover: none) { .card-manage { display: block; } }` ——触屏设备上每张卡片都显示"编辑/删除"按钮。
- **影响**：手机是主要场景，瀑布流中每张卡片多了两个按钮，干扰浏览；且小按钮易误触删除（虽有二次确认）。
- **修复**：移动端改为长按/点击卡片右上角"⋯"呼出操作菜单；或仅在详情弹窗内提供管理入口，卡片上彻底隐藏。

### 9. 专辑内作品无法排序（`sort_weight` 无 UI）
- **现象**：`models.py:Work.sort_weight` 字段存在，后端排序未使用它，前端无任何调整入口。
- **影响**：策展场景下无法置顶/手动排序，"专辑"退化为按时间堆叠的文件夹。
- **修复**：专辑详情页管理态加"上移/下移"（PATCH `sort_weight`），列表 `ORDER BY` 加入 `sort_weight DESC`；或最低成本：允许按 `sort_weight` 手动输入数值。

### 10. 空专辑/空标签页无管理入口引导
- **现象**：`EmptyState variant="album"` 文案是"登记作品并归入此专辑后会出现在这里"，但空专辑页没有"去登记"按钮，也没有"删除此空专辑"入口（管理按钮在 `AlbumManageSlot`，需 hover/常驻但空页头部没有）。
- **影响**：新专辑建完是空的，用户不知道下一步；想删掉建错的空专辑要回列表页找。
- **修复**：`EmptyState` 的 `ctaLabel/onCta` 在专辑空态时传入"登记作品"（跳 `/new?album=slug`）和"删除专辑"（二次确认）。

### 11. 登录页无令牌可见性切换
- **现象**：`web/components/admin/LoginForm.tsx` 的令牌输入框为 `type="password"`，无显示/隐藏切换。
- **影响**：长随机令牌手输时无法核对，输错只会看到"令牌无效"，排查困难。
- **修复**：加"👁 显示"切换按钮（`type` 在 password/text 间切换）。

### 12. 删除作品后无"撤销"或回收站
- **现象**：`api/app/routes/admin.py:delete_work()` 为物理删除（`session.delete`），前端仅 toast 提示"外部存储文件保留"。
- **影响**：误删 = 数据库行永久丢失（提示词、标签关联、专辑归属全丢），外部文件虽在但元数据无法恢复。对"备份"定位是致命的。
- **修复**：短期：删除前弹窗列出将丢失的关联信息（标签 N 个、专辑归属）；长期：加 `deleted_at` 软删除 + 回收站页（30 天后物理清除）。

---

## 🟢 可选优化（锦上添花）

### 13. 缺批量操作：无多选删除/移动/打标签
- **现象**：全站无批量选择模式；1000+ 作品的专辑整理只能一张张点。
- **影响**："备份整理"场景效率极低。
- **修复**：GalleryClient 加选择模式（长按/复选框），工具条提供"移入专辑/加标签/删除"批量接口（后端加 `PATCH /api/admin/works/batch`）。

### 14. 缺重复检测：`content_hash` 存了但无处用
- **现象**：`models.py:Work.content_hash` 字段存在且有索引（`idx_works_hash`），但无任何查询/ UI 使用它。
- **影响**：重复备份同一文件无法发现，存储与列表冗余。
- **修复**：/new 提交时若 `content_hash` 已存在则提示"疑似重复"（不阻止，可确认）；加"重复作品"检查页（按 `content_hash` 分组）。

### 15. 缺导出/备份：元数据无法导出
- **现象**：全站无导出功能；SQLite 文件在容器卷内，用户需 `docker cp` 才拿得到。
- **影响**："备份平台"自身元数据无备份出口，换机/迁移困难。
- **修复**：加 `GET /api/admin/export`（JSON Lines 全量作品+专辑+标签），前端在 /tags 或页脚加"导出备份"按钮。

### 16. 标签管理缺"合并"与"空标签清理"
- **现象**：`CollectionManage.tsx:TagManage` 仅支持重命名/删除；建错的相似标签（如"赛博朋克" vs "赛博 朋克"）无法合并。
- **影响**：标签体系随时间腐化。
- **修复**：标签管理加"合并到…"（把 A 的关联全移到 B 后删 A）；/tags 页标注 `count=0` 的标签并提供"清理空标签"。

### 17. 统计页只有数字，无趋势
- **现象**：`/api/stats` 返回总数，首页 `stats-strip` 仅展示四个数字。
- **影响**："备份"用户想知道"本月新增多少"，目前看不到。
- **修复**：stats 加 `by_month`（按 `created_at` 前缀分组近 12 个月），首页或新增 /stats 页用迷你柱状图展示。

### 18. 无深色模式
- **现象**：DESIGN 定为"晨雾画廊"亮色，全站无深色切换。
- **影响**：夜间浏览大图时亮色背景刺眼（图片浏览是夜间高频场景）。
- **修复**：CSS 变量已完备（`--c-*`），加 `data-theme="dark"` 一套变量 + Header 切换按钮，图片区用深灰衬底。

### 19. 视频无播放进度记忆与倍速
- **现象**：详情弹窗 `<video controls preload="metadata">` 为原生控件，无进度记忆。
- **影响**：长视频二次打开从头播放。
- **修复**：`localStorage` 按 work.id 存 `currentTime`，打开时恢复；加倍速按钮（0.5/1/1.5/2）。

### 20. README 与代码严重脱节
- **现象**：`README.md` 仍写"作品三态可见性 listed/unlisted/hidden""管理台 /admin""上架/下架"，Build-E 已全部删除。
- **影响**：新接手者（或未来的 AI 会话）按 README 理解会走错路。
- **修复**：重写 README 的功能一览与数据模型章节，与当前"无发布流、管理融进前台"对齐。

---

## Top 10 优先级清单

| 优先级 | 问题 | 分级 | 预计工作量 |
|---|---|---|---|
| 1 | ADMIN_TOKEN 无最小长度校验（#1） | 🔴 | 5 分钟（1 行 + 部署轮换） |
| 2 | JSON-LD XSS（#2） | 🔴 | 10 分钟（1 行转义） |
| 3 | httpx 合回 GitHub（#3） | 🔴 | 2 分钟（用户已改，只需 push） |
| 4 | 管理 API CSRF（#4） | 🔴 | 2 小时（改认证方式） |
| 5 | 搜索范围太窄（#5） | 🟡 | 30 分钟（后端 1 函数） |
| 6 | 专辑封面 N+1（#6） | 🟡 | 1 小时（后端顺手查 + 前端删代码） |
| 7 | 误删无回收站（#12） | 🟡 | 4 小时（软删除 + 回收站页） |
| 8 | 视频表单布局割裂（#7） | 🟡 | 1 小时（JSX 重排） |
| 9 | 移动端管理按钮噪音（#8） | 🟡 | 2 小时（操作菜单） |
| 10 | 批量操作缺失（#13） | 🟢 | 1 天（前后端） |

---

## 附：已确认良好的设计（无需改动）

- 全站密码保护经 `middleware.ts` 统一校验，无漏网公开接口（`/api/health` 放行属健康检查必需）。
- 删除专辑时 `ON DELETE SET NULL`、删除标签时 `ON DELETE CASCADE`，关联处理正确。
- Cursor 分页 + Offset 分页双轨制合理；自然排序 SQL/ Python 两侧共用同一实现。
- 图片 `loading="lazy"` + `aspect-ratio` 占位 + 三级回退（thumb → media → 断链兜底），加载体验完整。
- 提示词复制三级降级（clipboard → execCommand → 手动），移动端兼容性考虑周到。
- 登录限速（60s/10次）+ `hmac.compare_digest` + HttpOnly/SameSite Cookie，基础扎实。
