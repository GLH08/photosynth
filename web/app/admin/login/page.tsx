import type { Metadata } from "next";

import LoginForm from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "管理登录",
  description: "光合画廊管理台 —— 令牌登录。",
  robots: { index: false, follow: false },
};

/** /admin/login（DESIGN 4.3-⑨）：居中卡片，令牌输入 → 换发 HttpOnly Cookie；错误/限速走 toast。 */
export default function AdminLoginPage() {
  return (
    <div className="login-page">
      <LoginForm />
    </div>
  );
}
