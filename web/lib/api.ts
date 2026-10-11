/**
 * API 访问层：
 * - 服务端（RSC）直连 BACKEND_ORIGIN，fetch 失败一律返回 null（构建期/后端重启不崩页面）。
 * - 客户端走同源代理 /api/*（DESIGN 6.2）。
 */
import type {
  AlbumInfo,
  BatchPayload,
  BatchResult,
  BrowseMode,
  GalleryFilters,
  RatioBucket,
  SortOrder,
  StatsResponse,
  TagInfo,
  TrashPage,
  ViewState,
  WorkDetailResponse,
  WorkListItem,
  WorksPage,
  WorkType,
} from "./types";

/** 每页作品数（Build-F【2】：48 = 后端 limit 上限，一次请求铺满一页，减少往返） */
export const PAGE_SIZE = 48;

export function backendOrigin(): string {
  return (process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
}

export interface WorksQuery extends GalleryFilters {
  type?: WorkType;
  limit?: number;
  cursor?: string | null;
  /** Build-F【1】分页模式：1-based 页码（offset 分页，支持页码跳转） */
  page?: number;
}

export function buildWorksQuery(p: WorksQuery): string {
  const sp = new URLSearchParams();
  if (p.type) sp.set("type", p.type);
  if (p.ratio) sp.set("ratio", p.ratio);
  if (p.album) sp.set("album", p.album);
  for (const t of p.tags ?? []) sp.append("tag", t);
  if (p.featured) sp.set("featured", "1");
  if (p.q) sp.set("q", p.q);
  if (p.sort && p.sort !== "latest") sp.set("sort", p.sort);
  if (p.limit) sp.set("limit", String(p.limit));
  if (p.cursor) sp.set("cursor", p.cursor);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  return sp.toString();
}

/** 详情接口的邻接导航沿用同一筛选序列（DESIGN 3.1 prev/next） */
export function buildDetailQuery(f: GalleryFilters): string {
  const sp = new URLSearchParams();
  if (f.ratio) sp.set("ratio", f.ratio);
  if (f.album) sp.set("album", f.album);
  for (const t of f.tags ?? []) sp.append("tag", t);
  if (f.featured) sp.set("featured", "1");
  if (f.q) sp.set("q", f.q);
  if (f.sort && f.sort !== "latest") sp.set("sort", f.sort);
  return sp.toString();
}

/** 列表页 URL（筛选状态可分享；basePath = /gallery、/videos、/albums/[slug]…）
 *  Build-F【1】：浏览模式与页码一并写入 query（mode 恒显式，刷新不丢失）。 */
export function listUrlFromFilters(
  basePath: string,
  f: GalleryFilters,
  view?: ViewState,
): string {
  const sp = new URLSearchParams(buildWorksQuery(f));
  if (view) {
    sp.set("mode", view.mode);
    if (view.mode === "paged" && view.page > 1) sp.set("page", String(view.page));
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function galleryUrlFromFilters(f: GalleryFilters): string {
  return listUrlFromFilters("/gallery", f);
}

// ---------------------------------------------------------------- 服务端

async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${backendOrigin()}${path}`, {
      next: { revalidate: 60 },
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function getWorksPage(p: WorksQuery): Promise<WorksPage | null> {
  return serverGet<WorksPage>(`/api/works?${buildWorksQuery(p)}`);
}

/** GET /api/albums/{slug}：专辑信息 + 同构作品 cursor 列表（合并响应，DESIGN 3.1） */
export interface AlbumPageResponse extends WorksPage {
  album: AlbumInfo;
}

export function getAlbumPage(
  slug: string,
  f: WorksQuery = {},
): Promise<AlbumPageResponse | null> {
  const qs = buildWorksQuery(f);
  return serverGet<AlbumPageResponse>(
    `/api/albums/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`,
  );
}

export function getWorkDetail(id: string): Promise<WorkDetailResponse | null> {
  return serverGet<WorkDetailResponse>(`/api/works/${encodeURIComponent(id)}`);
}

export async function getAlbums(): Promise<AlbumInfo[]> {
  return (await serverGet<{ items: AlbumInfo[] }>("/api/albums"))?.items ?? [];
}

/** 专辑封面兜底：cover_url 为空时取专辑内首张作品缩略图（DESIGN 2.3 语义，页面层解析） */
export async function resolveAlbumCovers(albums: AlbumInfo[]): Promise<(string | null)[]> {
  return Promise.all(
    albums.map(async (a) => {
      if (a.cover_url) return a.cover_url;
      const page = await getWorksPage({ album: a.slug, limit: 1 });
      return page?.items[0]?.thumb_url ?? null;
    }),
  );
}

export async function getTags(): Promise<TagInfo[]> {
  return (await serverGet<TagInfo[]>("/api/tags")) ?? [];
}

export function getStats(): Promise<StatsResponse | null> {
  return serverGet<StatsResponse>("/api/stats");
}

// ---------------------------------------------------------------- 客户端

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function clientGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  return unwrap<T>(r);
}

/** 管理端写操作（POST/PATCH/DELETE）：204 → null；非 2xx → ApiClientError。
 * 自动携带 X-CSRF-Token（从 gal_csrf Cookie 读，Double-Submit 防 CSRF）。 */
export async function clientSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T | null> {
  const csrf = readCookie("gal_csrf");
  const r = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  return unwrap<T>(r);
}

/** 读指定 Cookie（CSRF token 用；HttpOnly 的读不到属正常）。 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// ---------------------------------------------------------------- 回收站（Build-G，管理端）

/** GET /api/admin/trash：仅已删除作品，deleted_at 倒序；total 供入口 badge 计数。 */
export function getTrash(limit = 24, offset = 0): Promise<TrashPage> {
  return clientGet<TrashPage>(`/api/admin/trash?limit=${limit}&offset=${offset}`);
}

/** POST /api/admin/works/{id}/restore：从回收站恢复（deleted_at 置 NULL）。 */
export function restoreWork(id: string): Promise<{ work: WorkListItem } | null> {
  return clientSend<{ work: WorkListItem }>(
    "POST",
    `/api/admin/works/${encodeURIComponent(id)}/restore`,
  );
}

/** DELETE /api/admin/works/{id}/purge：彻底删除（物理删库，不可恢复）。 */
export function purgeWork(id: string): Promise<null> {
  return clientSend<null>(
    "DELETE",
    `/api/admin/works/${encodeURIComponent(id)}/purge`,
  );
}

// ---------------------------------------------------------------- 批量操作 / 快捷精选（Build-H）

/** PATCH /api/admin/works/{id}：仅切换 featured（卡片/详情右上角快捷按钮），返回更新后的作品。 */
export function toggleFeatured(id: string, featured: boolean): Promise<{ work: WorkListItem }> {
  return clientSend<{ work: WorkListItem }>(
    "PATCH",
    `/api/admin/works/${encodeURIComponent(id)}`,
    { featured },
  ) as Promise<{ work: WorkListItem }>;
}

/** PATCH /api/admin/works/batch：批量操作；返回 {ok, failed}。 */
export function batchWorks(payload: BatchPayload): Promise<BatchResult> {
  return clientSend<BatchResult>("PATCH", "/api/admin/works/batch", payload) as Promise<BatchResult>;
}

async function unwrap<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let code = "http_error";
    let message = `请求失败（HTTP ${r.status}）`;
    try {
      const body = await r.json();
      if (body?.error?.code) {
        code = body.error.code;
        message = body.error.message ?? message;
      }
    } catch {
      /* 保留默认错误信息 */
    }
    throw new ApiClientError(message, r.status, code);
  }
  return (await r.json()) as T;
}

// ---------------------------------------------------------------- 解析与格式化

const RATIO_VALUES: RatioBucket[] = [
  "portrait", "square", "landscape",
  "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5",
];

const SORT_VALUES: SortOrder[] = ["latest", "oldest", "name"];

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseFiltersFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): GalleryFilters {
  const first = firstParam;
  const tags = Array.isArray(sp.tag)
    ? sp.tag.filter(Boolean)
    : sp.tag
      ? [sp.tag]
      : [];
  const ratioRaw = first(sp.ratio);
  const sortRaw = first(sp.sort);
  return {
    ratio: RATIO_VALUES.includes(ratioRaw as RatioBucket)
      ? (ratioRaw as RatioBucket)
      : undefined,
    album: first(sp.album) || undefined,
    tags,
    featured: first(sp.featured) === "1" || first(sp.featured) === "true" || undefined,
    q: first(sp.q) || undefined,
    sort: SORT_VALUES.includes(sortRaw as SortOrder)
      ? (sortRaw as SortOrder)
      : undefined,
  };
}

/** Build-F【1】：浏览模式 / 页码（URL query 同步；albumDefault 供专辑页默认分页模式） */
export function parseViewFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
  defaultMode: BrowseMode = "scroll",
): ViewState {
  const rawMode = firstParam(sp.mode);
  const mode: BrowseMode =
    rawMode === "paged" || rawMode === "scroll" ? rawMode : defaultMode;
  const rawPage = Number(firstParam(sp.page) ?? "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  return { mode, page: mode === "paged" ? page : 1 };
}

/** mm:ss / 超一小时 h:mm:ss（DESIGN 5.7 时长角标） */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "";
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatResolution(w: number, h: number): string {
  return `${w}×${h}`;
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}
