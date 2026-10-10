/**
 * /admin 管理台·作品管理（DESIGN 4.3-⑫，M6）：
 * SSR 门禁：转发 HttpOnly Cookie 直连后端校验，未登录 → 302 /admin/login；
 * SSR 首屏：按 URL 参数（type/q）取管理列表 + 专辑/标签选项，
 * 交互（筛选/搜索/分页/行内编辑/删除）由 AdminWorksClient 承担。
 */
import type { Metadata } from "next";

import AdminWorksClient from "@/components/admin/AdminWorksClient";
import { adminListAlbums, adminListTags, adminListWorks, requireAdminGate } from "@/lib/admin";
import type { AdminWorksQuery } from "@/lib/api";
import type { WorkType } from "@/lib/types";

export const metadata: Metadata = {
  title: "管理台 · 作品管理",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: Props) {
  await requireAdminGate();
  const sp = await searchParams;
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const typ = first(sp.type);
  const query: AdminWorksQuery = {
    type: typ === "image" || typ === "video" ? (typ as WorkType) : undefined,
    q: first(sp.q) || undefined,
    limit: 20,
  };

  const [page, albums, tags] = await Promise.all([
    adminListWorks(query),
    adminListAlbums(),
    adminListTags(),
  ]);

  return (
    <AdminWorksClient initial={page} initialQuery={query} albums={albums} tags={tags} />
  );
}
