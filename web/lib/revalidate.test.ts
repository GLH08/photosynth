/**
 * 缓存一致性单测（Build-M4）：Server Action `revalidateBulkViews` 的内部实现
 * 就是 `applyRevalidate(bulkRevalidatePaths(ids), revalidatePath)`，此处用 spy
 * 站位于 next/cache 的 revalidatePath，验证「对预期集合逐个 revalidatePath」。
 * 运行：`npm run test:unit`。
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { applyRevalidate, BULK_REVALIDATE_VIEWS, bulkRevalidatePaths } from "./revalidate.ts";

test("无 ids：恰好是六个全局视图", () => {
  assert.deepEqual(bulkRevalidatePaths(), [
    "/",
    "/gallery",
    "/videos",
    "/trash",
    "/albums",
    "/tags",
  ]);
});

test("有 ids：追加受影响详情页，且去重保序", () => {
  assert.deepEqual(bulkRevalidatePaths(["wk_a", "wk_b", "wk_a"]), [
    "/",
    "/gallery",
    "/videos",
    "/trash",
    "/albums",
    "/tags",
    "/works/wk_a",
    "/works/wk_b",
  ]);
});

test("applyRevalidate 对预期集合逐个调用 revalidatePath", () => {
  const calls: string[] = [];
  applyRevalidate(bulkRevalidatePaths(["wk_x"]), (p) => calls.push(p));
  assert.deepEqual(calls, [...BULK_REVALIDATE_VIEWS, "/works/wk_x"]);
});
