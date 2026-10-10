"use client";

/**
 * /admin/* 下隐藏公开 Footer（管理台独立布局，DESIGN 4.2）。
 * children 为服务端组件（SiteFooter SSR stats），本组件只做展示门禁。
 */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
