"use client";

/**
 * 管理登录表单（DESIGN 4.3-⑨，M6）：
 * 令牌输入 → POST /api/admin/login（同源代理 → api 校验 ADMIN_TOKEN，constant-time + IP 限速）
 * → 成功由 api 下发 HttpOnly + SameSite=Lax 签名 Cookie → 跳 /admin；失败/限速 toast 提示。
 * ADMIN_TOKEN 永不进 NEXT_PUBLIC_*，浏览器只接触 Cookie。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, clientSend } from "@/lib/api";

export default function LoginForm() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      await clientSend("POST", "/api/admin/login", { token: token.trim() });
      toast.push("登录成功，正在进入管理台", "success");
      router.replace("/admin");
      router.refresh(); // 让 /admin 的 SSR 门禁带上新 Cookie 重新校验
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : "登录失败，请确认后端服务后重试";
      toast.push(msg, "error");
      setBusy(false);
    }
  };

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <p className="eyebrow">Admin Console</p>
      <h1 className="login-title">管理台登录</h1>
      <p className="login-desc">
        输入管理令牌换发会话 Cookie（HttpOnly，7 天有效）。令牌仅经同源代理提交给后端校验，
        连续失败会触发限速（60 秒 / 10 次）。
      </p>
      <label className="form-field">
        <span className="form-label">管理令牌 ADMIN_TOKEN</span>
        <input
          className="form-input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="请输入管理令牌"
          autoComplete="current-password"
          autoFocus
          required
        />
      </label>
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !token.trim()}>
        {busy ? "登录中…" : "登录"}
      </button>
      <Link href="/" className="login-back">
        ← 返回前台
      </Link>
    </form>
  );
}
