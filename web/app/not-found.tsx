/**
 * 全站 404（M6 打磨）：晨雾风格——暖瓷白 + 雾蓝渐变衬底，居中卡片，
 * 提供回首页 / 图片画廊 / 视频画廊三条出路。
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <p className="notfound-code mono" aria-hidden="true">
          404
        </p>
        <p className="eyebrow">Not Found</p>
        <h1 className="notfound-title">这一页没有被陈列</h1>
        <p className="notfound-desc">
          链接可能已失效，或作品已被删除。
          去画廊里看看别的作品吧。
        </p>
        <div className="notfound-actions">
          <Link href="/" className="btn btn-primary">
            回到首页
          </Link>
          <Link href="/gallery" className="btn btn-secondary">
            图片画廊
          </Link>
          <Link href="/videos" className="btn btn-secondary">
            视频画廊
          </Link>
        </div>
      </div>
    </div>
  );
}
