# 字体文件说明

本目录应包含自托管的 Noto Sans SC woff2 字体（400/500/700），由 `web/lib/fonts.ts` 引用。

## 自动下载（默认，无需手动操作）

`npm run build` 前会自动执行 `prebuild` 钩子 → `node scripts/fetch-fonts.mjs`：

- 三文件齐全 → 直接跳过，构建继续；
- 任一缺失 → 从 jsDelivr fontsource CDN 下载缺失字重：
  `https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-{400,500,700}-normal.woff2`
  （约 1.1MB/字重；下载链路优先用 `curl` 走环境代理，失败回退 Node fetch）；
- 下载后校验文件头为 `wOF2`（woff2 魔数），失败则删除残留并中断构建；
- 已有文件**永不覆盖**（手动放置的 GB2312 子集版会被保留）。

Docker 构建同样生效（`npm run build` 触发同一钩子，需构建期可访问 jsDelivr）。

下载后应有：

- `noto-sans-sc-400.woff2`
- `noto-sans-sc-500.woff2`
- `noto-sans-sc-700.woff2`

## 手动放置（可选）

如需用更小的 GB2312 常用字子集版（每文件约 1MB），可手动覆盖同名文件，
脚本检测到文件存在会自动跳过：

```bash
cp /path/to/原项目/web/fonts/*.woff2 web/fonts/
```
