/**
 * /works/[id] 作品详情页（DESIGN 4.3-⑧，可分享 URL）：
 * 直接访问/外部分享打开（SSR 无覆盖层上下文）→ 渲染完整独立页：
 * 居中双栏卡片（左媒体右信息，同 lightbox 信息架构，复用 WorkDetailPanel）
 * + 底部「同专辑/相关标签作品」推荐条 + OG meta + JSON-LD。
 * （画廊内点击进入的 lightbox 覆盖层形态由 /gallery 的 WorkDialog + pushState 承担。）
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import RecoStrip from "@/components/RecoStrip";
import WorkPageBody from "@/components/WorkPageBody";
import { getWorkDetail, getWorksPage } from "@/lib/api";
import type { WorkDetail, WorkListItem } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

function isoDuration(sec: number | null): string | undefined {
  if (sec == null || !isFinite(sec)) return undefined;
  return `PT${Math.max(1, Math.round(sec))}S`;
}

function jsonLd(w: WorkDetail): Record<string, unknown> {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": w.type === "video" ? "VideoObject" : "ImageObject",
    name: w.title || "无题",
    description: (w.description || w.prompt || "").slice(0, 200),
    contentUrl: w.media_url,
    thumbnailUrl: w.thumb_url || w.media_url,
    keywords: w.tags.map((t) => t.name).join(", ") || undefined,
    creator: w.model_name ? { "@type": "SoftwareApplication", name: w.model_name } : undefined,
  };
  if (w.type === "video") {
    base.uploadDate = w.published_at ?? w.created_at;
    base.duration = isoDuration(w.duration_seconds);
    base.embedUrl = w.media_url;
  }
  return base;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getWorkDetail(id);
  if (!data) return { title: "作品不存在" };
  const w = data.work;
  const desc = (w.description || w.prompt || "").slice(0, 120);
  return {
    title: w.title || "作品详情",
    description: desc,
    openGraph: {
      title: `${w.title || "无题"} · 光合画廊`,
      description: desc,
      // DESIGN 4.3-⑧：og:type=video.other（video 时）
      type: w.type === "video" ? "video.other" : "website",
      images: [
        {
          url: w.thumb_url || w.media_url,
          width: w.width,
          height: w.height,
          alt: w.title || w.id,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: w.title || "作品详情",
      description: desc,
      images: [w.thumb_url || w.media_url],
    },
  };
}

export default async function WorkPage({ params }: Props) {
  const { id } = await params;
  const data = await getWorkDetail(id);
  if (!data) notFound();
  const work = data.work;

  // 推荐条：同专辑 → 相关标签 → 精选，依次回退；排除自身，最多 8 张
  let reco: WorkListItem[] = [];
  let recoTitle = "相关作品";
  if (work.album) {
    const page = await getWorksPage({ album: work.album.slug, limit: 9 });
    reco = page?.items ?? [];
    recoTitle = `同专辑 · ${work.album.name}`;
  }
  if (reco.filter((it) => it.id !== work.id).length === 0 && work.tags[0]) {
    const page = await getWorksPage({ tags: [work.tags[0].slug], limit: 9 });
    reco = page?.items ?? [];
    recoTitle = `同标签 · ${work.tags[0].name}`;
  }
  if (reco.filter((it) => it.id !== work.id).length === 0) {
    const page = await getWorksPage({ featured: true, limit: 9 });
    reco = page?.items ?? [];
    recoTitle = "精选作品";
  }
  const recoItems = reco.filter((it) => it.id !== work.id).slice(0, 8);

  // Build-L：返回目标随作品类型切换（视频 → /videos，图片 → /gallery）
  const listHref = work.type === "video" ? "/videos" : "/gallery";

  return (
    <div className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd(work)).replace(/</g, "\\u003c"),
        }}
      />

      <div className="work-back-row">
        <Link href={listHref} className="back-link">
          ← {work.type === "video" ? "返回视频" : "返回画廊"}
        </Link>
        <nav aria-label="相邻作品" style={{ display: "flex", gap: 8 }}>
          {data.prev_id && (
            <Link href={`/works/${data.prev_id}`} className="btn btn-secondary btn-sm">
              ‹ 上一幅
            </Link>
          )}
          {data.next_id && (
            <Link href={`/works/${data.next_id}`} className="btn btn-secondary btn-sm">
              下一幅 ›
            </Link>
          )}
        </nav>
      </div>

      <WorkPageBody work={work} />

      <RecoStrip title={recoTitle} items={recoItems} />
    </div>
  );
}
