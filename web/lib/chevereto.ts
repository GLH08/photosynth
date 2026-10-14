/**
 * Chevereto 变体 URL 派生（Build-M1；Build-M7 修正变体语义）：
 *
 * Chevereto 为每张图片自动生成两档变体，规则是在「最终扩展名」前插入后缀：
 *   - `.th`：实测 320×320 方形中心裁切（下载样本读 PNG IHDR 验证）。9:16 原图会被切掉
 *     头脚，违反站点「永不裁切 / 完整看见」的核心原则 → 严禁用于任何展示路径。
 *   - `.md`：等比缩放，最长边 500（9:16 原图 → 500×889，约 0.68MB）→ 所有展示路径唯一允许的档位。
 * 人类可读名与哈希名 URL 都有变体（HEAD 已验证）。
 *
 * 本 helper 对两档仍保持通用（`variant` 参数保留，作为纯 URL 工具），但调用方纪律是：
 * 展示路径一律传 `.md`；方形裁切的 `.th` 不得出现在任何展示代码里。
 *
 * 纪律（歧义一律原样返回，绝不猜测）：
 *   - 非 Chevereto URL（外部图床等）→ 原样返回；
 *   - 已带目标变体的 URL（如 `.md` + "md"）→ 原样返回；
 *   - 已带「不同」变体的 URL（如 `.th` + "md"）→ 替换成目标变体（Build-M8：避免
 *     M1 时期入库的 `.th` 默认 thumb 被当成「已是变体」而把方形裁切渲染进卡片）；
 *   - 非图片扩展名（.mp4 等）→ 原样返回（视频本体没有变体）；
 *   - 无扩展名 / 无法解析的 URL → 原样返回；
 *   - 路径已百分号编码时不动原串（直接对原始字符串做手术，不经过 URL 重编码）。
 */

export type CheveretoVariant = "th" | "md";

/**
 * 变体实测像素宽度（下载样本读 PNG IHDR 得出，供 srcset 宽度描述符用）。
 * 注意：`.th` 是 320×320 的方形裁切宽高，不保留原图比例 → 展示路径禁用。
 */
export const CHEVERETO_VARIANT_WIDTH: Record<CheveretoVariant, number> = {
  th: 320,
  md: 500,
};

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]);
const IMAGE_EXT_RE = "png|jpe?g|webp|gif|avif|bmp";
const VARIANT_CAPTURE_RE = new RegExp(`^(.*)\\.(th|md)\\.(${IMAGE_EXT_RE})$`, "i");

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
  const dir = main.slice(0, slash + 1);

  // 已带变体：等于目标变体则原样返回，不同则替换（Build-M8）。
  const existing = name.match(VARIANT_CAPTURE_RE);
  if (existing) {
    const [, base, current, ext] = existing;
    if (current.toLowerCase() === variant) return url;
    return `${dir}${base}.${variant}.${ext}${suffix}`;
  }

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return url; // 无扩展名
  const extRaw = name.slice(dot + 1);
  if (!IMAGE_EXT.has(extRaw.toLowerCase())) return url; // 非图片（.mp4 等）
  const base = name.slice(0, dot);
  if (!base) return url;

  return `${dir}${base}.${variant}.${extRaw}${suffix}`;
}

/**
 * 通用 `<img srcSet>` 构造器：`th(320w) → md(500w) → 原图(Nw)`（默认档位）。
 * 只在确为 Chevereto 图片、且存在比原图更小的变体时返回；否则返回 undefined（不加 srcset）。
 *
 * Build-M7：展示路径（卡片 / 封面 / 回收站 / 详情打底）已全部改成单一等比 `.md` src，
 * 不再使用 srcset —— 含原图的 srcset 在 DPR≥2 屏幕会让浏览器挑回 11MB 原图。
 * Build-M8：默认档位从 `["th", "md"]` 收窄为 `["md"]`，任何默认调用都不会再拿到
 * 320×320 方形裁切的 `.th`；仍需要 `.th` 的调用方必须显式传入（不推荐用于展示）。
 */
export function cheveretoSrcset(
  url: string | null | undefined,
  originalWidth: number,
  variants: readonly CheveretoVariant[] = ["md"],
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
