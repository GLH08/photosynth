/**
 * /works/[id]/edit 编辑作品（Build-E【2】：管理融进前台，详情页/卡片 hover 的编辑入口）。
 * SSR 取详情预填 WorkForm（编辑态走 PATCH）；不存在 → 404。
 * 全站已登录保护（middleware 统一校验），无需页面层门禁。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import WorkForm from "@/components/WorkForm";
import { getAlbums, getTags, getWorkDetail } from "@/lib/api";

export const metadata: Metadata = {
  title: "编辑作品",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditWorkPage({ params }: Props) {
  const { id } = await params;
  const [data, albums, tags] = await Promise.all([
    getWorkDetail(id),
    getAlbums(),
    getTags(),
  ]);
  if (!data) notFound();
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <WorkForm albums={albums} tags={tags} initial={data.work} />
    </div>
  );
}
