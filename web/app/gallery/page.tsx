/**
 * /gallery 图片画廊（DESIGN 4.3-②，核心页）：
 * SSR 首屏（含内联 aspect-ratio 占位，零 CLS）+ 客户端无限滚动；
 * FilterBar chips URL query 同步可分享；点击卡片 → lightbox 覆盖层 + /works/[id] URL 同步。
 */
import type { Metadata } from "next";

import GalleryClient from "@/components/GalleryClient";
import { getAlbums, getTags, getWorksPage, parseFiltersFromSearchParams } from "@/lib/api";

export const metadata: Metadata = {
  title: "图片画廊",
  description: "AI 生成图片作品瀑布流陈列——任何比例混排、永不裁切。",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GalleryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFiltersFromSearchParams(sp);

  // 后端不可达时全部静默降级为 null/[]（客户端会补拉），构建期不依赖网络
  const [works, albums, tags] = await Promise.all([
    getWorksPage({ ...filters, type: "image", limit: 24 }),
    getAlbums(),
    getTags(),
  ]);

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Gallery · Images</p>
        <h1 className="page-title">图片画廊</h1>
        <p className="page-desc">
          全部作品按真实宽高比完整陈列，任何比例混排、永不裁切。点击任意作品查看大图、提示词与生成参数。
        </p>
      </header>
      <GalleryClient
        initialData={works}
        initialFilters={filters}
        albums={albums}
        tags={tags}
        mediaType="image"
      />
    </div>
  );
}
