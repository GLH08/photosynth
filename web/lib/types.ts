/** API 契约类型（与 DESIGN 3.1 / api/app/routes/public.py 对齐）。 */

export type WorkType = "image" | "video";
export type RatioBucket = "portrait" | "square" | "landscape";
export type SortOrder = "latest" | "oldest";
export type Visibility = "public" | "unlisted" | "hidden";
export type AlbumKind = "image" | "video" | "mixed";

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
}

export interface ReferenceImage {
  order: number;
  url: string;
  thumb_url?: string | null;
}

export interface WorkDetail extends WorkListItem {
  negative_prompt: string | null;
  model_version: string | null;
  parameters: Record<string, unknown>;
  reference_images: ReferenceImage[];
  storage_backend: string;
  visibility: Visibility;
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

// ---------------------------------------------------------------- 管理端（M6）

/** GET /api/admin/works 列表项（work_to_dict(admin=True)，比公开详情多内部字段） */
export interface AdminWork extends WorkDetail {
  external_file_id: string | null;
  content_hash: string | null;
  sort_weight: number;
}

export interface AdminStats {
  total: number;
  public: number;
  unlisted: number;
  hidden: number;
  images: number;
  videos: number;
  featured: number;
}

export interface AdminWorksPage {
  items: AdminWork[];
  next_cursor: string | null;
  has_more: boolean;
  stats: AdminStats;
}

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

export function emptyFilters(): GalleryFilters {
  return { tags: [] };
}

export function filtersActive(f: GalleryFilters): boolean {
  return Boolean(f.ratio || f.album || f.tags?.length || f.featured || f.q);
}
