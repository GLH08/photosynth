"use client";

/**
 * /admin/login 登录页下隐藏公开 Footer（仅此一条 admin 路由保留）。
 * children 为服务端组件（SiteFooter SSR stats），本组件只做展示门禁。
 */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
