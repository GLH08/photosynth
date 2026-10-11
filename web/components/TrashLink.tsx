"use client";

/**
 * 回收站入口（Build-G）：已登录时在页脚显示「回收站」链接 + 数量 badge。
 * 数量取 GET /api/admin/trash?limit=1 的 total；未登录（401）/ 后端不可达时静默隐藏。
 * 路由变化时重新拉取，保证删除/恢复后计数刷新。
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { clientGet } from "@/lib/api";
import type { TrashPage } from "@/lib/types";

export default function TrashLink() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    clientGet<TrashPage>("/api/admin/trash?limit=1")
      .then((res) => {
        if (alive) setCount(res.total);
      })
      .catch(() => {
        /* 401 / 后端不可达：保持隐藏 */
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (count === null) return null;

  return (
    <Link href="/trash" className="footer-trash" aria-label={`回收站，共 ${count} 项`}>
      回收站
      {count > 0 && <span className="badge badge-hidden mono">{count}</span>}
    </Link>
  );
}
