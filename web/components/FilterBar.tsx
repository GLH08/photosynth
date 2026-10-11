"use client";

/**
 * FilterBar（DESIGN 5.8，Build-E【4】/ Build-F【1】）：筛选 chips——比例[全部|16:9|9:16|1:1|4:3|3:4|3:2|2:3|4:5]、
 * 标签（多选 AND）、仅精选 ★；Build-F 新增「排序」组（最新/最早/按名称）与
 * 「浏览」组（连续滚动/分页）；组名前置 13px ink-500；移动端横向滚动（边缘渐隐）。
 * 单选组互斥、标签组多选；变更经 onChange 上报（URL query 同步由页面层负责）；
 * 结果数实时更新（「共 N 幅」ink-300）；有选中时出现「清除全部筛选」Ghost 按钮。
 */
import type { AlbumInfo, BrowseMode, GalleryFilters, RatioBucket, SortOrder, TagInfo } from "@/lib/types";
import { filtersActive } from "@/lib/types";

interface Props {
  filters: GalleryFilters;
  albums: AlbumInfo[];
  tags: TagInfo[];
  total: number | null;
  unit?: string; // 「幅」/「条」
  /** 专辑详情页：专辑已锁定，隐藏专辑组 */
  hideAlbum?: boolean;
  /** 标签详情页：当前标签已锁定，隐藏标签组 */
  hideTags?: boolean;
  onChange: (next: GalleryFilters) => void;
  /** Build-F【1】浏览模式（scroll 连续滚动 / paged 分页） */
  mode: BrowseMode;
  onModeChange: (mode: BrowseMode) => void;
  /** Build-H【2】批量选择模式入口 */
  selectMode?: boolean;
  onToggleSelect?: () => void;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "latest", label: "最新" },
  { value: "oldest", label: "最早" },
  { value: "name", label: "按名称" },
];

const MODE_OPTIONS: { value: BrowseMode; label: string }[] = [
  { value: "scroll", label: "连续滚动" },
  { value: "paged", label: "分页" },
];

const RATIO_OPTIONS: { value?: RatioBucket; label: string }[] = [
  { value: undefined, label: "全部" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:5", label: "4:5" },
];

export default function FilterBar({
  filters,
  albums,
  tags,
  total,
  unit = "幅",
  hideAlbum = false,
  hideTags = false,
  onChange,
  mode,
  onModeChange,
  selectMode = false,
  onToggleSelect,
}: Props) {
  const patch = (part: Partial<GalleryFilters>) => onChange({ ...filters, ...part });

  const toggleTag = (slug: string) => {
    const current = filters.tags ?? [];
    const next = current.includes(slug)
      ? current.filter((t) => t !== slug)
      : [...current, slug];
    patch({ tags: next });
  };

  const active = filtersActive(filters);
  const visibleTags = tags.filter((t) => t.count > 0 || (filters.tags ?? []).includes(t.slug));

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">比例</span>
        <div className="chips-row">
          {RATIO_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="chip"
              aria-pressed={filters.ratio === opt.value}
              onClick={() => patch({ ratio: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">排序</span>
        <div className="chips-row">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="chip"
              aria-pressed={(filters.sort ?? "latest") === opt.value}
              onClick={() => patch({ sort: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">浏览</span>
        <div className="chips-row">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="chip"
              aria-pressed={mode === opt.value}
              onClick={() => onModeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!hideAlbum && albums.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">专辑</span>
          <div className="chips-row">
            <button
              type="button"
              className="chip"
              aria-pressed={!filters.album}
              onClick={() => patch({ album: undefined })}
            >
              全部
            </button>
            {albums.map((a) => (
              <button
                key={a.slug}
                type="button"
                className="chip"
                aria-pressed={filters.album === a.slug}
                onClick={() => patch({ album: filters.album === a.slug ? undefined : a.slug })}
              >
                {a.name}
                <span className="chip-count">{a.work_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!hideTags && visibleTags.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">标签</span>
          <div className="chips-row">
            {visibleTags.map((t) => (
              <button
                key={t.slug}
                type="button"
                className="chip"
                aria-pressed={(filters.tags ?? []).includes(t.slug)}
                onClick={() => toggleTag(t.slug)}
              >
                {t.name}
                <span className="chip-count">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-group filter-meta-row">
        <div className="chips-row">
          <button
            type="button"
            className="chip chip-featured"
            aria-pressed={Boolean(filters.featured)}
            onClick={() => patch({ featured: filters.featured ? undefined : true })}
          >
            仅精选 ★
          </button>
          {filters.q && (
            <button type="button" className="chip chip-search" aria-pressed onClick={() => patch({ q: undefined })}>
              搜索：{filters.q}
              <span className="chip-x" aria-hidden="true">✕</span>
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {total != null && (
            <span className="filter-total">
              共 {total} {unit}
            </span>
          )}
          {onToggleSelect && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-pressed={selectMode}
              onClick={onToggleSelect}
            >
              {selectMode ? "退出批量选择" : "批量选择"}
            </button>
          )}
          {active && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange({ tags: [], sort: filters.sort })}
            >
              清除全部筛选
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
