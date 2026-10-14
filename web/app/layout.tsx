import type { Metadata, Viewport } from "next";

import HideOnAdmin from "@/components/HideOnAdmin";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { ToastProvider } from "@/components/Toast";
import { notoSansSC } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "光合画廊 Photosynth",
    template: "%s · 光合画廊 Photosynth",
  },
  description: "AI 生成作品陈列馆 —— 图片与视频展示平台。媒体是唯一主角，界面安静退后。",
};

/**
 * 视口（Build-M6）：device-width 适配移动端；viewportFit=cover 让 iOS 安全区生效；
 * themeColor 取品牌钴蓝（--c-primary-600），移动端浏览器 UI 与站点同色。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3550CF",
};

/**
 * 全局布局（DESIGN 4.2）：
 * Header（sticky 毛玻璃白）→ 内容区（max-width 1440px，gutter 24/16px）→ Footer（stats 摘要）。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={notoSansSC.variable}>
      <body>
        <ToastProvider>
          <a href="#main" className="skip-link">
            跳到主要内容
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="page-shell">
            {children}
          </main>
          <HideOnAdmin>
            <SiteFooter />
          </HideOnAdmin>
        </ToastProvider>
      </body>
    </html>
  );
}
