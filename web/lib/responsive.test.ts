/**
 * 响应式图片（srcset / sizes）与 Chevereto 变体的连线测试（Build-M2）。
 * 运行：`npm run test:unit`。
 *
 * 卡片 <img>（MasonryCard，有内联 width/height + object-fit contain）：
 *   srcset 必须同时含 `.th`（320w）、`.md`（500w）与「原图（Nw）」三项。
 * 详情 <img>（WorkMedia 大图，无内联宽高、依赖固有比例）：
 *   只用 `.md`（500w）与原图——`.th` 是方形裁切，会破坏比例，故排除。
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { cheveretoSrcset } from "./chevereto.ts";
import { CARD_SIZES, DETAIL_SIZES, VIDEO_GRID_SIZES } from "./responsive.ts";

const THUMB = "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.png";

test("卡片 srcset 含 .th(320w) / .md(500w) / 原图(2160w)", () => {
  const set = cheveretoSrcset(THUMB, 2160); // 默认 ["th","md"]
  assert.ok(set);
  assert.match(set!, /hy-1409\.th\.png 320w/);
  assert.match(set!, /hy-1409\.md\.png 500w/);
  assert.match(set!, /hy-1409\.png 2160w/);
});

test("详情 srcset 只用 .md + 原图（排除方形 .th）", () => {
  const set = cheveretoSrcset(THUMB, 2160, ["md"]);
  assert.ok(set);
  assert.ok(!set!.includes(".th.png"), "详情大图不得纳入方形 .th");
  assert.match(set!, /hy-1409\.md\.png 500w/);
  assert.match(set!, /hy-1409\.png 2160w/);
});

test("sizes 匹配 globals.css 断点（1024/1280/1536 瀑布流；640/1024 视频网格）", () => {
  assert.match(CARD_SIZES, /min-width: 1536px/);
  assert.match(CARD_SIZES, /min-width: 1280px/);
  assert.match(CARD_SIZES, /min-width: 1024px/);
  assert.match(CARD_SIZES, /min-width: 640px/);
  assert.match(VIDEO_GRID_SIZES, /min-width: 1024px/);
  assert.match(VIDEO_GRID_SIZES, /min-width: 640px/);
  assert.match(DETAIL_SIZES, /min-width: 768px/);
});
