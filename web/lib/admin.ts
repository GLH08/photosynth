/**
 * 管理端 SSR 辅助（M6，仅服务端使用）：
 * - requireAdminGate：转发浏览器 HttpOnly Cookie 直连后端校验，401/403 → redirect("/admin/login")；
 * - adminListWorks / adminListAlbums / adminListTags：SSR 首屏数据（后端不可达 → null，客户端可重试）。
 * ADMIN_TOKEN 永不进 web 容器；浏览器只接触 Cookie（DESIGN 1.2）。
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { backendOrigin, buildAdminWorksQuery, type AdminWorksQuery } from "./api";
import type { AdminAlbum, AdminTag, AdminWorksPage } from "./types";

async function adminFetch<T>(path: string): Promise<{ status: number; data: T | null }> {
  try {
    const store = await cookies();
    const r = await fetch(`${backendOrigin()}${path}`, {
      headers: { cookie: store.toString(), accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return { status: r.status, data: null };
    return { status: r.status, data: (await r.json()) as T };
  } catch {
    return { status: 0, data: null }; // 后端不可达
  }
}

/** 管理页统一门禁：未登录（401/403）→ 跳登录页；后端不可达时放行由页面出错误态 */
export async function requireAdminGate(): Promise<void> {
  const { status } = await adminFetch<unknown>("/api/admin/works?limit=1");
  if (status === 401 || status === 403) redirect("/admin/login");
}

export async function adminListWorks(q: AdminWorksQuery): Promise<AdminWorksPage | null> {
  const { data } = await adminFetch<AdminWorksPage>(
    `/api/admin/works?${buildAdminWorksQuery(q)}`,
  );
  return data;
}

export async function adminListAlbums(): Promise<AdminAlbum[]> {
  const { data } = await adminFetch<{ items: AdminAlbum[] }>("/api/admin/albums");
  return data?.items ?? [];
}

export async function adminListTags(): Promise<AdminTag[]> {
  const { data } = await adminFetch<{ items: AdminTag[] }>("/api/admin/tags");
  return data?.items ?? [];
}
