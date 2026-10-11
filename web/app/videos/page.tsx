/**
 * /videos 视频画廊（DESIGN 4.3-③，M5）：
 * VideoCard 网格（poster 封面帧按真实比例 + 右下时长角标 + 中央播放浮标，网格内零视频请求）；
 * 复用 FilterBar（比例/专辑/标签/精选）；点击 → lightbox 内 <video controls preload="metadata" poster> 播放；
 * 默认 3 列大卡网格（grid 而非瀑布流更整齐；混比例仍按 aspect-ratio 保真）。
 */
import type { Metadata } from "next";

import GalleryClient from "@/components/GalleryClient";
import {
  PAGE_SIZE,
  getAlbums,
  getTags,
  getWorksPage,
  parseFiltersFromSearchParams,
  parseViewFromSearchParams,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "视频画廊",
  description: "AI 生成视频作品陈列——封面帧海报、时长角标，点击即可在弹窗内播放。",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VideosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFiltersFromSearchParams(sp);
  const view = parseViewFromSearchParams(sp);

  const [works, albums, tags] = await Promise.all([
    getWorksPage({
      ...filters,
      type: "video",
      limit: PAGE_SIZE,
      page: view.mode === "paged" ? view.page : undefined,
    }),
    getAlbums(),
    getTags(),
  ]);

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Gallery · Videos</p>
        <h1 className="page-title">视频画廊</h1>
        <p className="page-desc">
          封面帧即所见、时长一目了然；点击任意视频在弹窗内播放原片，网格内不加载视频本体。
        </p>
      </header>
      <GalleryClient
        initialData={works}
        initialFilters={filters}
        initialView={view}
        albums={albums}
        tags={tags}
        basePath="/videos"
        mediaType="video"
        layout="grid"
        unit="条"
      />
    </div>
  );
}
