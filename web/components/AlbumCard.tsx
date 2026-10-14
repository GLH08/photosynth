/**
 * 专辑入口卡片（DESIGN 4.3-④，首页与 /albums 复用）：
 * cover 16:10 contain + 衬底（cover_url 为空时由页面层取首张作品 thumb 兜底，DESIGN 2.3）
 * + 名称 + kind 徽章 + 简介一行 + 「N 幅作品」计数徽章。
 */
import Link from "next/link";

import { cheveretoVariant } from "@/lib/chevereto";
import type { AlbumInfo } from "@/lib/types";

const KIND_LABEL: Record<AlbumInfo["kind"], string> = {
  image: "图片专辑",
  video: "视频专辑",
  mixed: "图文混合",
};

interface Props {
  album: AlbumInfo;
  /** 已兜底解析的封面 URL（cover_url ?? 首张作品 thumb ?? null） */
  cover: string | null;
}

export default function AlbumCard({ album, cover }: Props) {
  return (
    <Link href={`/albums/${album.slug}`} className="album-card">
      <div className="album-cover">
        {cover ? (
          <img
            src={cheveretoVariant(cover, "md")}
            alt={`${album.name} 专辑封面`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="album-cover-empty" aria-hidden="true">
            ✦
          </span>
        )}
        <span className="album-count mono">{album.work_count} 幅作品</span>
      </div>
      <div className="album-card-body">
        <div className="album-card-title-row">
          <h3 className="album-card-name">{album.name}</h3>
          <span className="badge badge-kind">{KIND_LABEL[album.kind] ?? album.kind}</span>
        </div>
        {album.description && <p className="album-card-desc">{album.description}</p>}
      </div>
    </Link>
  );
}
