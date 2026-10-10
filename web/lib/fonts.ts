/**
 * 字体自托管（DESIGN 5.2）：Noto Sans SC 400/500/700 子集 woff2（GB2312 常用字，
 * 构建期由 next/font/local 加载仓库内 web/fonts/，零 Google Fonts CDN 依赖，font-display: swap）。
 */
import localFont from "next/font/local";

export const notoSansSC = localFont({
  src: [
    { path: "../fonts/noto-sans-sc-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/noto-sans-sc-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/noto-sans-sc-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-noto-sans-sc",
  adjustFontFallback: false, // 中文度量差异大，兜底交给系统字体栈
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});
