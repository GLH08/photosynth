"use server";

import { revalidatePath } from "next/cache";

import { applyRevalidate, bulkRevalidatePaths } from "./revalidate";

/**
 * Build-K：作品保存后按需失效其相关缓存。
 * 详情页 `/works/${id}` 与可能展示该作品的列表页（首页精选 rail、/gallery、/videos、
 * 所属专辑页、相关标签页）一并 revalidatePath，使编辑结果立即生效，无需等 60s ISR。
 *
 * 仅由已登录会话在 WorkForm 编辑态 PATCH 成功后调用（Server Action，无 HTTP 端点）；
 * 不做全局禁用缓存，列表页其余访问仍走原有 60s 缓存。
 */
export async function revalidateWorkViews(
  id: string,
  albumSlug: string | null,
  tagSlugs: string[],
): Promise<void> {
  revalidatePath(`/works/${id}`);
  revalidatePath("/");
  revalidatePath("/gallery");
  revalidatePath("/videos");
  if (albumSlug) revalidatePath(`/albums/${albumSlug}`);
  for (const slug of tagSlugs) revalidatePath(`/tags/${slug}`);
}

/**
 * Build-M4：批量改动（批量操作 / 回收站恢复·彻底删除 / 单条移入回收站）成功后，
 * 失效所有会被影响的视图缓存。当前页由本地状态 + router.refresh() 负责，
 * 这里解决「其他页面最多 60s 才更新」的问题；ids 已知时一并失效对应详情页。
 */
export async function revalidateBulkViews(ids: string[] = []): Promise<void> {
  applyRevalidate(bulkRevalidatePaths(ids), revalidatePath);
}
