"use client";

/**
 * 管理台外壳（DESIGN 4.2：左侧窄栏导航 + 右侧工作区，深一度底色与公开区隔）：
 * 作品管理 / 登记作品 / 专辑与标签；底部返回前台 + 退出登录（清 Cookie）。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { clientSend } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/admin", label: "作品管理", exact: true },
  { href: "/admin/works/new", label: "登记作品", exact: false },
  { href: "/admin/collections", label: "专辑与标签", exact: false },
] as const;

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    try {
      await clientSend("POST", "/api/admin/logout");
    } catch {
      /* Cookie 清除失败也直接回登录页 */
    }
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-side-head">
          <span className="admin-logo">
            光合画廊
            <span className="admin-logo-sub">管理台</span>
          </span>
        </div>
        <nav className="admin-nav" aria-label="管理台导航">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="admin-side-foot">
          <Link href="/" className="admin-nav-link">
            ← 返回前台
          </Link>
          <button type="button" className="admin-nav-link admin-logout" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
