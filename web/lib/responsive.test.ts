/**
 * 展示路径变体纪律测试（Build-M7，原 Build-M2 的 srcset 连线测试已被此纪律取代）。
 * 运行：`npm run test:unit`。
 *
 * 背景：`.th` 是 320×320 的方形中心裁切（下载样本读 PNG IHDR 验证），9:16 原图会被
 * 切掉头脚，违反站点「永不裁切 / 完整看见」的核心原则 → 所有展示路径必须改用等比 `.md`。
 *
 * 同时卡片/详情不再使用 srcset：含原图的 srcset 在 DPR≥2 屏幕会让浏览器挑回 11MB 原图，
 * 卡片必须始终停在约 0.68MB 的 `.md`（详情大图另走「原图交叉淡入」设计，src 固定 = 原图）。
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { CARD_SIZES, DETAIL_SIZES, VIDEO_GRID_SIZES } from "./responsive.ts";

const componentsUrl = new URL("../components/", import.meta.url);
const readComponent = (name: string) => readFileSync(new URL(name, componentsUrl), "utf8");

/** 展示路径必须使用等比 `.md` 的组件。 */
const MD_DISPLAY_COMPONENTS = [
  "MasonryCard.tsx",
  "AlbumCard.tsx",
  "TrashClient.tsx",
  "WorkMedia.tsx",
  "WorkDetailPanel.tsx",
];

test("components/ 下没有任何组件传方形裁切的 th 变体（应只剩注释里对它的说明）", () => {
  const files = readdirSync(componentsUrl).filter((f) => f.endsWith(".tsx"));
  for (const name of files) {
    assert.ok(
      !readComponent(name).includes('"th"'),
      `${name} 不得传 "th" 变体（320×320 方形裁切，会切掉 9:16 头脚）`,
    );
  }
});

test("展示路径改用等比 md 变体", () => {
  for (const name of MD_DISPLAY_COMPONENTS) {
    assert.ok(readComponent(name).includes('"md"'), `${name} 应使用等比 .md 展示变体`);
  }
});

test("卡片与详情打底不再使用 srcset（含原图会在 DPR≥2 挑回原图）", () => {
  assert.ok(!readComponent("MasonryCard.tsx").includes("srcSet"), "MasonryCard 不得含 srcSet");
  assert.ok(!readComponent("WorkMedia.tsx").includes("srcSet"), "WorkMedia 不得含 srcSet");
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
