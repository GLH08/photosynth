# Build-F 进度（专辑分页/排序/瀑布流 + 加载优化 + 详情弹窗，断点续跑用）

格式：时间 | 内容 | 状态

## 计划（3 个用户反馈）
1. 【1】专辑分页：后端加 `page`（offset 分页）与 `sort=name`（自然排序）；前端加「分页/连续滚动」两模式 + 排序 chips，状态入 URL query（`mode`/`page`/`sort`）；MasonryGrid 从 CSS multi-column 改 JS 最短列分配（修最后一列空缺/重排错乱）。
2. 【2】加载慢：定位（列表 limit、缩略图、懒加载、预加载）→ 分页模式每页 48、列表请求减小 limit 次数、确认卡片走 thumb_url/懒加载、视频 preload=metadata。
3. 【3】详情弹窗：下载走同源 `/api/media/{id}?download=1`（后端代理转发外部直链 + Content-Disposition）；专辑信息卡明确可点跳转专辑页。
4. 验证：pytest 全过、tsc --noEmit、npm run build、1000+ 条临时库走查（名称排序/翻页/URL 状态）。

- 2026-10-11 09:55 | 计划落盘（本文件创建）；基线：pytest 41 passed、tsc clean；已通读前后端关键文件 | ✅
- 2026-10-11 10:20 | 【1】后端排序/分页：新增 app/textsort.py 自然排序键（数字段补零 20 位 + \x01 分隔，大小写归一）；db.py 在 SQLite 连接上注册用户函数 natural_sort_key（每个连接都注册）；public.py 加 sort=name（ORDER BY / cursor / prev-next 邻居全部走同一键）、加 page（offset 分页，供页码跳转，与 cursor 并存）；cursor 载荷泛化为 (排序键|id)；pytest 49 passed（新增 7 个用例） | ✅
- 2026-10-11 10:25 | 【3】后端下载转发：/api/media/{id}?download=1 用 httpx 流式转发外部直链 + Content-Disposition（ASCII 回退 + RFC5987 filename*），失败 502 media_fetch_failed；_open_upstream 单独抽出便于测试；pytest 49 passed | ✅
- 2026-10-11 10:40 | 【2】慢因定位（脚本 /tmp/opencode/perf/bench.py，合成 1200 条 hy-N 作品，进程内计时）：API 单次 8–13 ms、每页 15–31 KB → **API 不慢**；慢在连续滚动 limit=24 需 ~50 次串行请求 + 1200 张外部图床缩略图（HTTP/1.1 每域 6 连接）；name 排序 page=13 返回 hy-577/578/579 验证自然序正确 | ✅
