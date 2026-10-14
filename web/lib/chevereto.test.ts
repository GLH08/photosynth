/**
 * chevereto 变体派生 helper 单测（Build-M1）。
 * 运行：`npm run test:unit`（= node --test lib/chevereto.test.ts，Node 24 原生 TS 类型擦除）。
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { cheveretoSrcset, cheveretoVariant, CHEVERETO_VARIANT_WIDTH } from "./chevereto.ts";

const HUMAN = "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.png";

test("Chevereto 人类可读 URL：th / md 插在最终扩展名前", () => {
  assert.equal(
    cheveretoVariant(HUMAN, "th"),
    "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png",
  );
  assert.equal(
    cheveretoVariant(HUMAN, "md"),
    "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.md.png",
  );
});

test("Chevereto 哈希名 URL 同样派生变体", () => {
  const hashUrl = "https://chevereto.novaw.de/images/2026/10/09/4a568c37abc.png";
  assert.equal(
    cheveretoVariant(hashUrl, "th"),
    "https://chevereto.novaw.de/images/2026/10/09/4a568c37abc.th.png",
  );
});

test("非 Chevereto URL：原样返回", () => {
  const picsum = "https://picsum.photos/id/1015/1600/1067";
  assert.equal(cheveretoVariant(picsum, "th"), picsum);
  assert.equal(cheveretoVariant(picsum, "md"), picsum);
  assert.equal(cheveretoSrcset(picsum, 1600), undefined);
});

test("已带变体的 URL：同变体原样返回，不同变体替换（Build-M8，不产生 .th.th）", () => {
  const th = "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png";
  const md = "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.md.png";
  assert.equal(cheveretoVariant(th, "th"), th); // 已是目标变体 → 原样
  assert.equal(cheveretoVariant(md, "md"), md); // 已是目标变体 → 原样
  // `.th` + "md" → 替换为等比 `.md`（M1 入库的方形裁切默认 thumb 由此被纠正）
  assert.equal(
    cheveretoVariant(th, "md"),
    "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.md.png",
  );
  // `.md` + "th" → 替换为 `.th`（通用工具仍双向）
  assert.equal(
    cheveretoVariant(md, "th"),
    "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png",
  );
});

test("变体替换：保留 query / hash 与原始编码", () => {
  const thWithQuery = `${HUMAN.replace(/\.png$/, ".th.png")}?v=2&x=1#frag`;
  assert.equal(
    cheveretoVariant(thWithQuery, "md"),
    `${HUMAN.replace(/\.png$/, ".md.png")}?v=2&x=1#frag`,
  );
});

test("带 query 的 URL：变体插入扩展名前，query 原样保留", () => {
  const withQuery = `${HUMAN}?v=2&x=1`;
  assert.equal(
    cheveretoVariant(withQuery, "th"),
    "https://chevereto.novaw.de/images-chevereto-remote/2026/10/01/hy-1409.th.png?v=2&x=1",
  );
});

test("视频本体（.mp4）等非图片扩展名：原样返回", () => {
  const mp4 = "https://chevereto.novaw.de/images/2026/10/09/4a568c37abc.mp4";
  assert.equal(cheveretoVariant(mp4, "md"), mp4);
});

test("无扩展名 / 无法解析：原样返回", () => {
  assert.equal(cheveretoVariant("https://chevereto.novaw.de/i/noext", "th"), "https://chevereto.novaw.de/i/noext");
  assert.equal(cheveretoVariant("not a url", "th"), "not a url");
  assert.equal(cheveretoVariant("", "th"), "");
  assert.equal(cheveretoVariant(null, "th"), "");
});

test("srcset：默认档位为 .md（不再含方形裁切的 .th）＋ 原图 w 描述符", () => {
  const set = cheveretoSrcset(HUMAN, 2160);
  assert.ok(set, "应为 Chevereto 图片生成 srcset");
  assert.match(set!, /hy-1409\.md\.png 500w/);
  assert.ok(!set!.includes(".th.png"), "默认 srcset 不得包含 .th 方形裁切");
  assert.match(set!, /hy-1409\.png 2160w/);
  assert.equal(CHEVERETO_VARIANT_WIDTH.th, 320);
  assert.equal(CHEVERETO_VARIANT_WIDTH.md, 500);
});

test("srcset：显式传入 [\"th\", \"md\"] 时仍两档都生成（通用工具）", () => {
  const set = cheveretoSrcset(HUMAN, 2160, ["th", "md"]);
  assert.ok(set);
  assert.match(set!, /hy-1409\.th\.png 320w/);
  assert.match(set!, /hy-1409\.md\.png 500w/);
  assert.match(set!, /hy-1409\.png 2160w/);
});

test("srcset：默认只含 md，变体不小于原图时不生成 srcset", () => {
  // 原图 400：md(500) ≥ 400 跳过 → 无更小变体 → 不生成 srcset
  assert.equal(cheveretoSrcset(HUMAN, 400), undefined);
  assert.equal(cheveretoSrcset(HUMAN, 300), undefined);
});
