/**
 * /admin/works/new 登记作品（DESIGN 4.3-⑪，M6）：
 * SSR 门禁（未登录 → /admin/login）+ 分区表单（基本信息 / 媒体 URL 与尺寸 /
 * 提示词 / 参数 JSON / 参考图有序列表 / 专辑标签 / 可见性与精选）。
 */
import type { Metadata } from "next";

import WorkForm from "@/components/admin/WorkForm";
import { adminListAlbums, adminListTags, requireAdminGate } from "@/lib/admin";

export const metadata: Metadata = {
  title: "管理台 · 登记作品",
  robots: { index: false, follow: false },
};

export default async function NewWorkPage() {
  await requireAdminGate();
  const [albums, tags] = await Promise.all([adminListAlbums(), adminListTags()]);
  return <WorkForm albums={albums} tags={tags} />;
}
