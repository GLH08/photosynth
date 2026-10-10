/**
 * /admin/collections 专辑与标签管理（DESIGN 4.3-⑫，M6）：
 * SSR 门禁（未登录 → /admin/login）+ 首屏取 admin albums/tags；
 * CRUD（新建/改名/改 slug/删除，删除均二次确认）+ slug 自动生成。
 */
import type { Metadata } from "next";

import CollectionsClient from "@/components/admin/CollectionsClient";
import { adminListAlbums, adminListTags, requireAdminGate } from "@/lib/admin";

export const metadata: Metadata = {
  title: "管理台 · 专辑与标签",
  robots: { index: false, follow: false },
};

export default async function CollectionsPage() {
  await requireAdminGate();
  const [albums, tags] = await Promise.all([adminListAlbums(), adminListTags()]);
  return <CollectionsClient initialAlbums={albums} initialTags={tags} />;
}
