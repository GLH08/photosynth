/**
 * 管理台面板布局（/admin、/admin/works/new、/admin/collections 共用；
 * /admin/login 在路由组外，无外壳）。左侧窄栏导航 + 右侧工作区（DESIGN 4.2）。
 */
import AdminShell from "@/components/admin/AdminShell";

export default function AdminPanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
