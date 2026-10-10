/**
 * API 访问层：
 * - 服务端（RSC）直连 BACKEND_ORIGIN，fetch 失败一律返回 null（构建期/后端重启不崩页面）。
 * - 客户端走同源代理 /api/*（DESIGN 6.2）。
 */
import type {
  AlbumInfo,
  GalleryFilters,
  RatioBucket,
  SortOrder,
  StatsResponse,
  TagInfo,
  WorkDetailResponse,
  WorksPage,
  WorkType,
} from "./types";

export function backendOrigin(): string {
  return (process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
}

export interface WorksQuery extends GalleryFilters {
  type?: WorkType;
  limit?: number;
  cursor?: string | null;
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

/** 列表页 URL（筛选状态可分享；basePath = /gallery、/videos、/albums/[slug]…） */
export function listUrlFromFilters(basePath: string, f: GalleryFilters): string {
  const qs = buildWorksQuery(f);
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
  f: GalleryFilters = {},
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

/** 管理端写操作（POST/PATCH/DELETE）：204 → null；非 2xx → ApiClientError */
export async function clientSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T | null> {
  const r = await fetch(path, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  return unwrap<T>(r);
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

export function parseFiltersFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): GalleryFilters {
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const tags = Array.isArray(sp.tag)
    ? sp.tag.filter(Boolean)
    : sp.tag
      ? [sp.tag]
      : [];
  const ratioRaw = first(sp.ratio);
  const sortRaw = first(sp.sort);
  // Build-E【4】：11 值超集（8 真实比例 + 3 旧桶兼容，老分享链接仍可用）
  const RATIO_VALUES: RatioBucket[] = [
    "portrait", "square", "landscape",
    "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5",
  ];
  return {
    ratio: RATIO_VALUES.includes(ratioRaw as RatioBucket)
      ? (ratioRaw as RatioBucket)
      : undefined,
    album: first(sp.album) || undefined,
    tags,
    featured: first(sp.featured) === "1" || first(sp.featured) === "true" || undefined,
    q: first(sp.q) || undefined,
    sort: sortRaw === "oldest" ? ("oldest" as SortOrder) : undefined,
  };
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
