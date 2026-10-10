import type { Metadata } from "next";
import { Suspense } from "react";

import LoginForm from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "登录",
  description: "光合画廊 —— 令牌登录（整站仅站长可访问）。",
  robots: { index: false, follow: false },
};

/** /admin/login（全站登录入口）：居中卡片，令牌输入 → 换发 HttpOnly Cookie → 跳回 ?next=。 */
export default function AdminLoginPage() {
  return (
    <div className="login-page">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
