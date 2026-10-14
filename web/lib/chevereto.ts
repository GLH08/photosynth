/**
 * Chevereto 变体 URL 派生（Build-M1）：
 *
 * Chevereto 为每张图片自动生成两档变体，规则是在「最终扩展名」前插入后缀：
 *   - `.th`（thumb，实测 320×320 方形）
 *   - `.md`（medium，实测最长边 500）
 * 人类可读名与哈希名 URL 都有变体（HEAD 已验证）。
 *
 * 纪律（歧义一律原样返回，绝不猜测）：
 *   - 非 Chevereto URL（外部图床等）→ 原样返回；
 *   - 已带 `.th` / `.md` 变体的 URL → 原样返回（避免 `.th.th`）；
 *   - 非图片扩展名（.mp4 等）→ 原样返回（视频本体没有变体）；
 *   - 无扩展名 / 无法解析的 URL → 原样返回；
 *   - 路径已百分号编码时不动原串（直接对原始字符串做手术，不经过 URL 重编码）。
 */

export type CheveretoVariant = "th" | "md";

/** 变体实测像素宽度（下载样本读 PNG IHDR 得出，供 srcset 宽度描述符用）。 */
export const CHEVERETO_VARIANT_WIDTH: Record<CheveretoVariant, number> = {
  th: 320,
  md: 500,
};

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
const VARIANT_RE = /\.(?:th|md)\.(?:png|jpe?g|webp|gif|avif|bmp)$/i;

/** 是否 Chevereto 托管的媒体 URL（按主机名判定）。 */
export function isCheveretoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("chevereto");
  } catch {
    return false;
  }
}

/**
 * 返回 `url` 的 `variant` 变体地址；任何不确定的情形都返回原 `url`。
 */
export function cheveretoVariant(
  url: string | null | undefined,
  variant: CheveretoVariant,
): string {
  if (!url) return "";
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url; // 相对 URL / 非法 URL：不动
  }
  if (!host.includes("chevereto")) return url;

  // 对原始字符串做手术：保留 path/query/hash 的原始编码，不做 URL 归一化。
  const cut = url.search(/[?#]/);
  const main = cut < 0 ? url : url.slice(0, cut);
  const suffix = cut < 0 ? "" : url.slice(cut);

  const slash = main.lastIndexOf("/");
  const name = main.slice(slash + 1);
  if (VARIANT_RE.test(name)) return url; // 已是变体

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return url; // 无扩展名
  const extRaw = name.slice(dot + 1);
  if (!IMAGE_EXT.has(extRaw.toLowerCase())) return url; // 非图片（.mp4 等）
  const base = name.slice(0, dot);
  if (!base) return url;

  return `${main.slice(0, slash + 1)}${base}.${variant}.${extRaw}${suffix}`;
}

/**
 * 为 `<img srcSet>` 构造 `w` 描述符列表：`th(320w) → md(500w) → 原图(Nw)`。
 * 只在确为 Chevereto 图片、且存在比原图更小的变体时返回；否则返回 undefined（不加 srcset）。
 *
 * `variants` 可选，用来排除不适合该位的档位：详情大图无内联宽高、依赖图片自身固有比例，
 * 而 `.th` 是方形裁切（会改变比例），故详情只允许 `["md"]`；卡片有 width/height + contain，
 * 用默认 `["th", "md"]` 安全。
 */
export function cheveretoSrcset(
  url: string | null | undefined,
  originalWidth: number,
  variants: readonly CheveretoVariant[] = ["th", "md"],
): string | undefined {
  if (!url) return undefined;
  const entries: string[] = [];
  for (const variant of variants) {
    const width = CHEVERETO_VARIANT_WIDTH[variant];
    if (originalWidth > 0 && width >= originalWidth) continue; // 不比原图小则无意义
    const candidate = cheveretoVariant(url, variant);
    if (candidate && candidate !== url) entries.push(`${candidate} ${width}w`);
  }
  if (entries.length === 0) return undefined; // 非 Chevereto：不加 srcset
  if (originalWidth > 0) entries.push(`${url} ${originalWidth}w`);
  return entries.join(", ");
}
