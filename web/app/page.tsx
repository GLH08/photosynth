/**
 * / 首页 —— 精选陈列（DESIGN 4.3-①，M5 重做，门面页）：
 * Hero（晨雾渐变 + 标语 + 双 CTA）→ 平台 stats（图片/视频/专辑/精选）
 * → 精选作品横滑 rail（featured=1）→ 专辑入口卡片 → 底部双 CTA。
 * SSR + 60s ISR（4.1 路由总表）；后端不可达时各区块静默降级为空态。
 */
import type { Metadata } from "next";
import Link from "next/link";

import AlbumCard from "@/components/AlbumCard";
import EmptyState from "@/components/EmptyState";
import FeaturedRail from "@/components/FeaturedRail";
import { getAlbums, getStats, getWorksPage, resolveAlbumCovers } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "光合画廊 Photosynth", absolute: "光合画廊 Photosynth —— AI 生成作品陈列馆" },
  description:
    "AI 生成图片与视频作品陈列馆：真实比例完整呈现、永不裁切，提示词与生成参数全程可溯源。",
};

export const revalidate = 60; // SSR + 60s ISR（DESIGN 4.1）

export default async function Home() {
  const [featured, stats, albums] = await Promise.all([
    getWorksPage({ featured: true, limit: 12 }),
    getStats(),
    getAlbums(),
  ]);
  const covers = await resolveAlbumCovers(albums);
  const featuredItems = featured?.items ?? [];

  return (
    <>
      {/* ---------- Hero：晨雾渐变 + 标语 + CTA ---------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner container">
          <p className="eyebrow">AI Generated Works Gallery</p>
          <h1 className="hero-title" id="hero-title">
            让每一幅 AI 作品，
            <br />
            被<em>完整</em>看见
          </h1>
          <p className="hero-sub">
            光合画廊 Photosynth —— 读多写少的作品陈列馆。图片与视频一律按真实宽高比陈列、永不裁切；
            提示词、参考图与生成参数全程可溯源。
          </p>
          <div className="hero-cta">
            <Link href="/gallery" className="btn btn-primary btn-lg">
              进入图片画廊
            </Link>
            <Link href="/videos" className="btn btn-secondary btn-lg">
              浏览视频作品
            </Link>
          </div>
        </div>
      </section>

      <div className="container">
        {/* ---------- 平台 stats ---------- */}
        <section className="stats-strip" aria-label="平台数据">
          <div className="stat">
            <span className="stat-num mono">{stats ? stats.works.images : "—"}</span>
            <span className="stat-label">幅图片</span>
          </div>
          <div className="stat">
            <span className="stat-num mono">{stats ? stats.works.videos : "—"}</span>
            <span className="stat-label">条视频</span>
          </div>
          <div className="stat">
            <span className="stat-num mono">{stats ? stats.albums : "—"}</span>
            <span className="stat-label">个专辑</span>
          </div>
          <div className="stat">
            <span className="stat-num mono">{stats ? stats.featured : "—"}</span>
            <span className="stat-label">幅精选</span>
          </div>
        </section>

        {/* ---------- 精选作品横滑 rail ---------- */}
        <section className="page-section" aria-labelledby="featured-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Featured</p>
              <h2 className="section-title" id="featured-title">
                精选作品 <span className="section-star" aria-hidden="true">★</span>
              </h2>
            </div>
            <Link href="/gallery?featured=1" className="btn btn-ghost btn-sm">
              查看全部精选 →
            </Link>
          </div>
          {featuredItems.length > 0 ? (
            <FeaturedRail items={featuredItems} />
          ) : (
            <EmptyState
              variant="site"
              copy={{
                title: "还没有精选作品",
                desc: "在管理台把作品标记为「精选 ★」后，会陈列在这里。",
              }}
            />
          )}
        </section>

        {/* ---------- 专辑入口 ---------- */}
        <section className="page-section" aria-labelledby="albums-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">Albums</p>
              <h2 className="section-title" id="albums-title">
                专辑
              </h2>
            </div>
            <Link href="/albums" className="btn btn-ghost btn-sm">
              全部专辑 →
            </Link>
          </div>
          {albums.length > 0 ? (
            <div className="album-grid">
              {albums.map((album, i) => (
                <AlbumCard key={album.slug} album={album} cover={covers[i] ?? null} />
              ))}
            </div>
          ) : (
            <EmptyState
              variant="site"
              copy={{
                title: "还没有专辑",
                desc: "去管理台创建第一个专辑，把同主题的作品收进一起陈列。",
              }}
            />
          )}
        </section>

        {/* ---------- 底部双 CTA（4.3-①） ---------- */}
        <section className="home-cta" aria-label="浏览全部作品">
          <Link href="/gallery" className="btn btn-secondary btn-lg">
            浏览全部图片
          </Link>
          <Link href="/videos" className="btn btn-secondary btn-lg">
            浏览全部视频
          </Link>
        </section>
      </div>
    </>
  );
}
