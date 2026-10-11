/**
 * /trash 回收站（Build-G）：
 * 已移入回收站的作品列表（缩略图 + 标题 + 删除时间），可恢复或彻底删除。
 * 数据经客户端拉取（管理端需 Cookie，SSR 无 Cookie）；middleware 已做整站登录保护。
 */
import type { Metadata } from "next";

import TrashClient from "@/components/TrashClient";

export const metadata: Metadata = {
  title: "回收站",
  description: "已移入回收站的作品——可恢复回画廊，或彻底删除（不可恢复）。",
};

export default function TrashPage() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Trash</p>
        <h1 className="page-title">回收站</h1>
        <p className="page-desc">
          已移入回收站的作品不会出现在公开画廊。可随时「恢复」；「彻底删除」将永久移除数据库记录且不可恢复。
        </p>
      </header>
      <TrashClient />
    </div>
  );
}
