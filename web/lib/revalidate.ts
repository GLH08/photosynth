/**
 * 批量改动后需要失效的视图集合（Build-M4，纯逻辑，可单测）。
 *
 * 批量操作 / 回收站恢复·彻底删除 / 单条移入回收站会同时影响多个页面的展示：
 *   - 首页 /（精选 rail、专辑入口、stats）
 *   - /gallery、/videos（作品网格）
 *   - /trash（回收站）
 *   - /albums、/tags（计数）
 *   - 受影响作品的详情页 /works/[id]（ids 已知时）
 * 当前页由客户端本地状态 + router.refresh() 负责，这里只解决「别的页面 60s ISR 才更新」。
 */

export const BULK_REVALIDATE_VIEWS = ["/", "/gallery", "/videos", "/trash", "/albums", "/tags"] as const;

/** 固定视图 + 受影响作品详情页（去重、保持顺序）。 */
export function bulkRevalidatePaths(ids: readonly string[] = []): string[] {
  const paths: string[] = [...BULK_REVALIDATE_VIEWS];
  const seen = new Set(paths);
  for (const id of ids) {
    if (!id) continue;
    const path = `/works/${id}`;
    if (!seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}

/** 依次调用 `revalidate`（生产里是 next/cache 的 revalidatePath）。 */
export function applyRevalidate(
  paths: readonly string[],
  revalidate: (path: string) => void,
): void {
  for (const path of paths) revalidate(path);
}
