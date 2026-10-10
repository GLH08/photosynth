import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // DESIGN 1.2：产物镜像小、启动快
  reactStrictMode: true,
  /**
   * 安全头（M6 安全清单）：
   * - X-Content-Type-Options: nosniff（禁 MIME 嗅探）
   * - Referrer-Policy: strict-origin-when-cross-origin（外发仅带 origin；媒体外链另有
   *   referrerpolicy="no-referrer" 逐元素收紧）
   * - CSP frame-ancestors 'self'（禁第三方 iframe 嵌套，防点击劫持；不加 script/img 限制，
   *   媒体为外部直链热加载）
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
