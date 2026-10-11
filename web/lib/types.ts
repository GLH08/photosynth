/** API 契约类型（与 DESIGN 3.1 / api/app/routes/public.py 对齐）。 */

export type WorkType = "image" | "video";
export type RatioBucket =
  | "portrait" | "square" | "landscape" // 旧桶：仅 URL 兼容保留，UI 已改用真实比例值
  | "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "3:2" | "2:3" | "4:5";
/** Build-F【1】：name = 名称自然排序（hy-1 < hy-2 < … < hy-10，后端 SQL 侧完成） */
export type SortOrder = "latest" | "oldest" | "name";
export type AlbumKind = "image" | "video" | "mixed";

/** Build-F【1】浏览模式：scroll = 连续滚动（cursor 无限加载）；paged = 传统页码 */
export type BrowseMode = "scroll" | "paged";

/** Build-F【1】浏览状态（URL query 同步：mode/page） */
export interface ViewState {
  mode: BrowseMode;
  page: number;
}

export interface TagBrief {
  slug: string;
  name: string;
}

export interface AlbumBrief {
  slug: string;
  name: string;
}

export interface AlbumInfo {
  slug: string;
  name: string;
  description: string;
  cover_url: string | null;
  kind: AlbumKind;
  work_count: number;
  sort_weight: number;
}

export interface TagInfo {
  slug: string;
  name: string;
  count: number;
}

/** 列表项即含 lightbox 所需字段（DESIGN 3.1） */
export interface WorkListItem {
  id: string;
  type: WorkType;
  title: string;
  description: string;
  prompt: string;
  model_name: string;
  width: number;
  height: number;
  media_url: string;
  thumb_url: string;
  poster_url: string | null;
  duration_seconds: number | null;
  featured: boolean;
  album: AlbumBrief | null;
  tags: TagBrief[];
  published_at: string | null;
  /** Build-G：移入回收站的时间（仅管理端响应携带，公开列表恒为 undefined） */
  deleted_at?: string | null;
}

export interface ReferenceImage {
  order: number;
  url: string;
  thumb_url?: string | null;
  /** Build-E【3】：视频首帧 first / 尾帧 last；图片参考图无 role */
  role?: "first" | "last" | null;
}

export interface WorkDetail extends WorkListItem {
  negative_prompt: string | null;
  model_version: string | null;
  parameters: Record<string, unknown>;
  reference_images: ReferenceImage[];
  storage_backend: string;
  source_meta: unknown;
  created_at: string;
  updated_at: string;
}

export interface WorksPage {
  items: WorkListItem[];
  next_cursor: string | null;
  has_more: boolean;
  total: number;
}

export interface WorkDetailResponse {
  work: WorkDetail;
  prev_id: string | null;
  next_id: string | null;
}

export interface StatsResponse {
  works: { images: number; videos: number };
  albums: number;
  tags: number;
  featured: number;
}

/** FilterBar 筛选状态（URL query 同步，DESIGN 5.8） */
export interface GalleryFilters {
  ratio?: RatioBucket;
  album?: string;
  tags?: string[];
  featured?: boolean;
  q?: string;
  sort?: SortOrder;
}

// ---------------------------------------------------------------- 管理端（Build-E【2】：管理融进前台）

/** GET /api/admin/albums 列表项（work_count 含全部可见性） */
export interface AdminAlbum extends AlbumInfo {
  id: string;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/admin/tags 列表项 */
export interface AdminTag extends TagInfo {
  id: string;
}

/** GET /api/admin/trash（Build-G 回收站：仅已删除作品，offset 分页，deleted_at 倒序） */
export interface TrashPage {
  items: WorkListItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export function emptyFilters(): GalleryFilters {
  return { tags: [] };
}

export function filtersActive(f: GalleryFilters): boolean {
  return Boolean(f.ratio || f.album || f.tags?.length || f.featured || f.q);
}
