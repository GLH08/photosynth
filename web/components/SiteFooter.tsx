/**
 * SiteFooter（DESIGN 4.2）：stats 摘要（N 幅图片 · N 条视频 · N 个专辑）。
 * 服务端组件：/api/stats 失败时静默降级（不显示数字）。
 */
import { getStats } from "@/lib/api";

export default async function SiteFooter() {
  const stats = await getStats();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p className="footer-slogan">光合画廊 Photosynth —— AI 生成作品陈列馆</p>
        {stats && (
          <p className="footer-stats mono">
            {stats.works.images} 幅图片 · {stats.works.videos} 条视频 · {stats.albums} 个专辑 ·{" "}
            {stats.featured} 幅精选
          </p>
        )}
      </div>
    </footer>
  );
}
