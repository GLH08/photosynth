/**
 * /tags/[slug] 标签聚合页（DESIGN 4.3-⑦，M5）：
 * 标签名 + 计数头部 + 复用 MasonryGrid（无限滚动）；该标签为锁定筛选，
 * FilterBar 仍提供比例/专辑/精选细化（标签组隐藏，避免与锁定项混淆）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import GalleryClient from "@/components/GalleryClient";
import { getAlbums, getStats, getTags, getWorksPage, parseFiltersFromSearchParams } from "@/lib/api";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tags = await getTags();
  const tag = tags.find((t) => t.slug === slug);
  if (!tag) return { title: "标签不存在" };
  return {
    title: `#${tag.name}`,
    description: `标签「${tag.name}」下的 ${tag.count} 幅作品 —— 光合画廊。`,
  };
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const filters = parseFiltersFromSearchParams(sp);

  const [tags, albums, works] = await Promise.all([
    getTags(),
    getAlbums(),
    getWorksPage({ ...filters, tags: [slug], limit: 24 }),
  ]);
  const tag = tags.find((t) => t.slug === slug);

  if (!tag) {
    // 后端可达 → 标签不存在 → 404；后端不可达 → 降级壳（works=null，客户端补拉）
    const stats = await getStats();
    if (stats) notFound();
  }

  return (
    <div className="container">
      <div className="work-back-row">
        <Link href="/tags" className="back-link">
          ← 全部标签
        </Link>
      </div>

      <header className="page-head">
        <p className="eyebrow">Tag</p>
        <div className="album-title-row">
          <h1 className="page-title">#{tag?.name ?? slug}</h1>
          {tag && <span className="badge badge-featured mono">{tag.count} 幅作品</span>}
        </div>
      </header>

      <GalleryClient
        initialData={works}
        initialFilters={filters}
        albums={albums}
        tags={tags}
        basePath={`/tags/${slug}`}
        baseFilters={{ tags: [slug] }}
        hideTags
      />
    </div>
  );
}
