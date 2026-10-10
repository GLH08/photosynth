/**
 * 构建前字体自检（Build-D【4】）：
 * 检查 web/fonts/noto-sans-sc-{400,500,700}.woff2，三文件缺失则从
 * jsDelivr fontsource CDN 下载（chinese-simplified 子集，约 1.1MB/字重）。
 * 已有文件一律跳过（不覆盖手动放置的 GB2312 子集版）。
 * 下载后校验文件头为 wOF2（woff2 魔数），失败则删残留并退出非零。
 *
 * 用法：node scripts/fetch-fonts.mjs（package.json prebuild 钩子自动调用）
 */
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(HERE, "..", "fonts");

const WEIGHTS = ["400", "500", "700"];
const fileName = (w) => `noto-sans-sc-${w}.woff2`;
const cdnUrl = (w) =>
  `https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-${w}-normal.woff2`;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function execFileAsync(file, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(file, args, opts, (err, stdout, stderr) => {
      if (err) reject(new Error(`${file} 失败: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

/** curl 优先（走环境代理链路，实测直连 fetch 会超时），失败回退 Node fetch */
async function download(url, dest) {
  try {
    await execFileAsync(
      "curl",
      ["-fsSL", "--retry", "2", "--max-time", "60", "-o", dest, url],
      { timeout: 90000 },
    );
    return;
  } catch (curlErr) {
    console.log(`[fonts] curl 失败，回退 Node fetch: ${curlErr.message}`);
  }
  return new Promise((resolve, reject) => {
    const cleanup = (err) => {
      import("node:fs").then(({ unlink }) => unlink(dest, () => reject(err)));
    };
    const req = fetch(url, { redirect: "follow" }).then(async (res) => {
      if (!res.ok || !res.body) {
        reject(new Error(`下载失败 HTTP ${res.status}: ${url}`));
        return;
      }
      const out = createWriteStream(dest);
      out.on("error", cleanup);
      out.on("finish", () => resolve());
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!out.write(value)) await new Promise((r) => out.once("drain", r));
        }
        out.end();
      } catch (err) {
        cleanup(err);
      }
    });
    req.catch(reject);
  });
}

async function checkWof2(path) {
  const { open } = await import("node:fs/promises");
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(4);
    await fh.read(buf, 0, 4, 0);
    return buf.toString("ascii") === "wOF2";
  } finally {
    await fh.close();
  }
}

async function main() {
  await mkdir(FONTS_DIR, { recursive: true });
  const missing = [];
  for (const w of WEIGHTS) {
    const p = join(FONTS_DIR, fileName(w));
    if (await exists(p)) {
      const { size } = await stat(p);
      console.log(`[fonts] 已存在，跳过: ${fileName(w)} (${Math.round(size / 1024)}KB)`);
    } else {
      missing.push(w);
    }
  }
  if (missing.length === 0) {
    console.log("[fonts] 三字重齐全，无需下载。");
    return;
  }
  console.log(`[fonts] 缺失 ${missing.length} 个字重，从 jsDelivr 下载: ${missing.join(", ")}`);
  for (const w of missing) {
    const dest = join(FONTS_DIR, fileName(w));
    await download(cdnUrl(w), dest);
    if (!(await checkWof2(dest))) {
      const { unlink } = await import("node:fs/promises");
      await unlink(dest).catch(() => {});
      console.error(`[fonts] 校验失败（非 wOF2 文件头），已删除残留: ${fileName(w)}`);
      process.exit(1);
    }
    const { size } = await stat(dest);
    console.log(`[fonts] 已下载: ${fileName(w)} (${Math.round(size / 1024)}KB，wOF2 校验通过)`);
  }
}

main().catch((err) => {
  console.error(`[fonts] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
