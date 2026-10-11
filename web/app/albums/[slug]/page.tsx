/**
 * /albums/[slug] 专辑详情（DESIGN 4.3-⑤，M5）：
 * 专辑头部（名称/描述/计数/kind 徽章）+ 按 kind 复用 MasonryGrid（image/mixed）
 * 或视频网格（video）；筛选沿用 FilterBar（专辑锁定，比例/标签/精选可调）。
 * Build-F【1】：专辑作品动辄上千张，默认「分页模式」（每页 48 张，URL 可跳页），
 * 可切换为「连续滚动」；模式/页码/排序均入 URL query。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import GalleryClient from "@/components/GalleryClient";
import {
  PAGE_SIZE,
  getAlbumPage,
  getStats,
  getTags,
  parseFiltersFromSearchParams,
  parseViewFromSearchParams,
} from "@/lib/api";
import type { AlbumKind } from "@/lib/types";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KIND_LABEL: Record<AlbumKind, string> = {
  image: "图片专辑",
  video: "视频专辑",
  mixed: "图文混合",
};

/** 专辑页默认分页模式（1000+ 张不逐个无限加载） */
const ALBUM_DEFAULT_MODE = "paged" as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getAlbumPage(slug, {});
  if (!data) return { title: "专辑不存在" };
  return {
    title: data.album.name,
    description: data.album.description || `${data.album.name} —— 光合画廊专辑，共 ${data.total} 幅作品。`,
  };
}

export default async function AlbumPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const filters = parseFiltersFromSearchParams(sp);
  const view = parseViewFromSearchParams(sp, ALBUM_DEFAULT_MODE);

  const [data, tags] = await Promise.all([
    getAlbumPage(slug, {
      ...filters,
      limit: PAGE_SIZE,
      page: view.mode === "paged" ? view.page : undefined,
    }),
    getTags(),
  ]);

  if (!data) {
    // 后端可达 → 专辑确实不存在 → 404；后端不可达 → 降级壳（客户端补拉，失败出重试态）
    const stats = await getStats();
    if (stats) notFound();
    return (
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">Album</p>
          <h1 className="page-title">专辑</h1>
        </header>
        <GalleryClient
          initialData={null}
          initialFilters={filters}
          initialView={view}
          defaultMode={ALBUM_DEFAULT_MODE}
          albums={[]}
          tags={tags}
          basePath={`/albums/${slug}`}
          baseFilters={{ album: slug }}
          hideAlbum
        />
      </div>
    );
  }

  const album = data.album;
  const isVideoAlbum = album.kind === "video";

  return (
    <div className="container">
      <div className="work-back-row">
        <Link href="/albums" className="back-link">
          ← 全部专辑
        </Link>
      </div>

      <header className="page-head album-head">
        <p className="eyebrow">Album</p>
        <div className="album-title-row">
          <h1 className="page-title">{album.name}</h1>
          <span className="badge badge-kind">{KIND_LABEL[album.kind] ?? album.kind}</span>
          <span className="badge badge-featured mono">{album.work_count} 幅作品</span>
        </div>
        {album.description && <p className="page-desc">{album.description}</p>}
      </header>

      <GalleryClient
        initialData={data}
        initialFilters={filters}
        initialView={view}
        defaultMode={ALBUM_DEFAULT_MODE}
        albums={[]}
        tags={tags}
        basePath={`/albums/${slug}`}
        mediaType={isVideoAlbum ? "video" : album.kind === "image" ? "image" : undefined}
        layout={isVideoAlbum ? "grid" : "masonry"}
        unit={isVideoAlbum ? "条" : "幅"}
        baseFilters={{ album: slug }}
        hideAlbum
        emptyBase="album"
      />
    </div>
  );
}
