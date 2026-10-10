/**
 * /new 作品登记页（Build-E【2】：管理融进前台，原 /admin/works/new 表单前移）。
 * 全站已登录保护（middleware 统一校验），无需页面层门禁。
 */
import type { Metadata } from "next";

import WorkForm from "@/components/WorkForm";
import { getAlbums, getTags } from "@/lib/api";

export const metadata: Metadata = {
  title: "新建作品",
  description: "登记一幅 AI 生成作品——只存外部媒体直链与元数据，不落盘二进制。",
  robots: { index: false, follow: false },
};

export default async function NewWorkPage() {
  const [albums, tags] = await Promise.all([getAlbums(), getTags()]);
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <WorkForm albums={albums} tags={tags} />
    </div>
  );
}
