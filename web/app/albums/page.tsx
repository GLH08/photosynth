/**
 * /albums 专辑总览（DESIGN 4.3-④，M5）：
 * 响应式专辑卡片网格——封面（cover_url，空则取专辑内首张作品 thumb）16:10 contain
 * + 名称 + kind 徽章 + 简介一行 + 「N 幅作品」计数徽章。SSR + 60s ISR。
 */
import type { Metadata } from "next";

import AlbumCard from "@/components/AlbumCard";
import EmptyState from "@/components/EmptyState";
import { getAlbums, resolveAlbumCovers } from "@/lib/api";

export const metadata: Metadata = {
  title: "专辑",
  description: "按主题策展的作品合集——图片专辑、视频专辑与图文混合。",
};

export const revalidate = 60;

export default async function AlbumsPage() {
  const albums = await getAlbums();
  const covers = await resolveAlbumCovers(albums);

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Albums</p>
        <h1 className="page-title">专辑</h1>
        <p className="page-desc">
          按主题策展的作品合集。封面为专辑自定义图或首张作品缩略图，计数只统计已上架作品。
        </p>
      </header>

      {albums.length > 0 ? (
        <div className="album-grid" style={{ paddingBottom: 48 }}>
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
    </div>
  );
}
