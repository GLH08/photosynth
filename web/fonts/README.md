# 字体文件说明

本目录应包含自托管的 Noto Sans SC woff2 字体（400/500/700），由 `web/lib/fonts.ts` 引用。
因体积原因未随仓库推送，请按以下任一方式补充：

## 方式一：从 Google Fonts 下载（推荐）

```bash
cd web/fonts
# Noto Sans SC 各字重 woff2（latin 子集可从 Google Fonts CSS API 获取完整版）
# 示例：访问 https://fonts.google.com/noto/specimen/Noto+Sans+SC 下载
```

下载后重命名为：
- `noto-sans-sc-400.woff2`
- `noto-sans-sc-500.woff2`
- `noto-sans-sc-700.woff2`

## 方式二：从原项目复制

如果你有原项目目录，直接复制：

```bash
cp /path/to/原项目/web/fonts/*.woff2 web/fonts/
```

## 说明

原仓库使用的是 GB2312 常用字子集（每文件约 1MB）；直接用 Google Fonts 完整版亦可正常构建，只是体积稍大。
构建命令会校验字体文件存在，缺失时 `next build` 会报错。
