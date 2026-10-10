"use client";

/**
 * 登录表单（全站登录保护入口）：
 * 令牌输入 → POST /api/admin/login（同源代理 → api 校验 ADMIN_TOKEN，constant-time + IP 限速）
 * → 成功由 api 下发 HttpOnly + SameSite=Lax 签名 Cookie → 跳回 ?next=（同站路径白名单，无则 /）。
 * ADMIN_TOKEN 永不进 NEXT_PUBLIC_*，浏览器只接触 Cookie。
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, clientSend } from "@/lib/api";

/** 只允许同站绝对路径跳转（防开放重定向；middleware 的 next 即此格式）。 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  try {
    const u = new URL(raw, "http://x");
    if (u.host !== "x" || u.protocol !== "http:") return "/";
    if (u.pathname.startsWith("/admin/login")) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}

export default function LoginForm() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const next = safeNext(searchParams.get("next"));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      await clientSend("POST", "/api/admin/login", { token: token.trim() });
      toast.push("登录成功，正在进入", "success");
      router.replace(next);
      router.refresh(); // 让目标页 SSR 带上新 Cookie 重新校验
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : "登录失败，请确认后端服务后重试";
      toast.push(msg, "error");
      setBusy(false);
    }
  };

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <p className="eyebrow">Photosynth</p>
      <h1 className="login-title">登录</h1>
      <p className="login-desc">
        本站仅站长可访问。输入管理令牌换发会话 Cookie（HttpOnly，7 天有效）。
        令牌仅经同源代理提交给后端校验，连续失败会触发限速（60 秒 / 10 次）。
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
    </form>
  );
}
