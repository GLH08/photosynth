"use client";

/**
 * 作品列表客户端编排层（DESIGN 4.3-②/③/⑤/⑦ 复用）：
 * - FilterBar chips 变更 → URL query 同步（history.replaceState，可分享）→ cursor 清空重载 + 回滚顶部；
 * - 无限滚动（IntersectionObserver + cursor）；骨架屏（首屏 / 追加）；
 * - 点击卡片 → WorkDialog 覆盖层 + history.pushState('/works/[id]') URL 同步；
 *   关闭时 history.back()；浏览器后退（popstate）直接收起覆盖层，不重复回退；
 * - 空状态文案变体；
 * - 多形态：mediaType=image|video；layout=masonry|grid（视频网格 3/2/1 列）；
 *   baseFilters 为页面锁定筛选（专辑/标签详情页），始终并入请求且不可被清除。
 */
import { useCallback, useEffect, useRef, useState } from "react";

import EmptyState, { type EmptyVariant } from "./EmptyState";
import FilterBar from "./FilterBar";
import MasonryCard from "./MasonryCard";
import MasonryGrid, { staggerDelay, type MasonryEntry } from "./MasonryGrid";
import { MasonrySkeleton, MasonrySkeletonSmall, VideoGridSkeleton } from "./Skeleton";
import WorkDialog from "./WorkDialog";
import { buildWorksQuery, clientGet, listUrlFromFilters } from "@/lib/api";
import type {
  AlbumInfo,
  GalleryFilters,
  TagInfo,
  WorkListItem,
  WorksPage,
  WorkType,
} from "@/lib/types";
import { filtersActive } from "@/lib/types";

interface Props {
  initialData: WorksPage | null; // SSR 首屏（后端不可达时为 null，客户端补拉）
  initialFilters: GalleryFilters;
  albums: AlbumInfo[];
  tags: TagInfo[];
  /** URL 同步基路径：/gallery、/videos、/albums/[slug]、/tags/[slug] */
  basePath?: string;
  /** 锁定媒体类型；mixed 专辑传 undefined（图+视频混排） */
  mediaType?: WorkType;
  /** grid = 视频网格（比例通常统一，grid 更整齐；混比例仍按 aspect-ratio 保真） */
  layout?: "masonry" | "grid";
  unit?: string; // 「幅」/「条」
  /** 页面锁定筛选（专辑/标签详情），不可被「清除全部筛选」移除 */
  baseFilters?: GalleryFilters;
  hideAlbum?: boolean;
  hideTags?: boolean;
  /** 无任何用户筛选且结果为空时的文案变体 */
  emptyBase?: EmptyVariant;
}

function toEntries(items: WorkListItem[]): MasonryEntry[] {
  return items.map((work, i) => ({ work, enterDelayMs: staggerDelay(i) }));
}

export default function GalleryClient({
  initialData,
  initialFilters,
  albums,
  tags,
  basePath = "/gallery",
  mediaType,
  layout = "masonry",
  unit = "幅",
  baseFilters,
  hideAlbum = false,
  hideTags = false,
  emptyBase = "site",
}: Props) {
  const [filters, setFilters] = useState<GalleryFilters>(initialFilters);
  const [entries, setEntries] = useState<MasonryEntry[]>(() =>
    initialData ? toEntries(initialData.items) : [],
  );
  const [total, setTotal] = useState<number | null>(initialData?.total ?? null);
  const [hasMore, setHasMore] = useState(initialData?.has_more ?? false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    initialData ? "ready" : "loading",
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [openWorkId, setOpenWorkId] = useState<string | null>(null);

  // Build-E【4】：同路由 query 导航同步（Header 搜索回车若改用 router.push 的兜底；
  // 当前 Header 用整页跳转时本 effect 首挂载即对齐，无副作用）。
  // App Router 同路由 ?q= 变化会重跑 page（initialFilters 更新）但 useState 不跟进，
  // 此处检测到外部 filters 变化 → 直接采用 SSR 数据重置列表。
  const extKey = JSON.stringify(initialFilters);
  useEffect(() => {
    const curKey = JSON.stringify(filtersRef.current);
    if (curKey === extKey) return;
    setFilters(initialFilters);
    filtersRef.current = initialFilters;
    cursorRef.current = initialData?.next_cursor ?? null;
    hasMoreRef.current = initialData?.has_more ?? false;
    setHasMore(initialData?.has_more ?? false);
    setTotal(initialData?.total ?? null);
    setEntries(initialData ? toEntries(initialData.items) : []);
    setPhase(initialData ? "ready" : "loading");
    window.scrollTo({ top: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extKey]);

  const cursorRef = useRef<string | null>(initialData?.next_cursor ?? null);
  const hasMoreRef = useRef(initialData?.has_more ?? false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const openRef = useRef<string | null>(null);
  openRef.current = openWorkId;
  const entriesRef = useRef<MasonryEntry[]>([]);
  entriesRef.current = entries;
  const inFlight = useRef(false); // 仅约束「加载更多」单飞；首页/筛选重载按 reqSeq 丢弃过期响应
  const reqSeq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(Boolean(initialData));

  /** 锁定筛选并入（base 优先，用户不可清除） */
  const merged = useCallback(
    (f: GalleryFilters): GalleryFilters => ({ ...f, ...baseFilters }),
    [baseFilters],
  );

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      // Build-E【1】：单飞检查必须在占序号之前——否则 observer 在加载中再次触发时，
      // seq 空转 + 直接返回，会把正在飞的正常响应判为过期丢弃，列表永久停滞（提前终止）。
      if (cursor && inFlight.current) return;
      const seq = ++reqSeq.current; // 过期响应按序号丢弃（快速切换筛选不串页）
      if (cursor) {
        inFlight.current = true;
        setLoadingMore(true);
      }
      try {
        const qs = buildWorksQuery({
          ...merged(filtersRef.current),
          type: mediaType,
          limit: 24,
          cursor,
        });
        const page = await clientGet<WorksPage>(`/api/works?${qs}`);
        if (seq !== reqSeq.current) return;
        cursorRef.current = page.next_cursor;
        hasMoreRef.current = page.has_more;
        setHasMore(page.has_more);
        setTotal(page.total);
        setEntries((prev) => (cursor ? [...prev, ...toEntries(page.items)] : toEntries(page.items)));
        setPhase("ready");
      } catch {
        if (seq !== reqSeq.current) return;
        setPhase((prev) => (cursor ? prev : "error"));
      } finally {
        if (cursor) {
          inFlight.current = false;
          setLoadingMore(false);
        }
      }
    },
    [merged, mediaType],
  );

  // SSR 不可达时客户端补拉首屏
  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void fetchPage(null);
    }
  }, [fetchPage]);

  // 筛选变更：URL 同步 + cursor 清空重载 + 回滚顶部（5.8）
  const applyFilters = useCallback(
    (next: GalleryFilters) => {
      setFilters(next);
      filtersRef.current = next;
      window.history.replaceState(window.history.state, "", listUrlFromFilters(basePath, merged(next)));
      cursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
      setEntries([]);
      setTotal(null);
      setPhase("loading");
      window.scrollTo({ top: 0, behavior: "auto" });
      void fetchPage(null);
    },
    [basePath, fetchPage, merged],
  );

  // 无限滚动：IntersectionObserver + cursor
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records[0]?.isIntersecting && hasMoreRef.current && !inFlight.current) {
          void fetchPage(cursorRef.current);
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchPage]);

  // 打开 lightbox：覆盖层 + URL 同步（pushState，可复制分享）
  const openWork = useCallback((work: WorkListItem) => {
    setOpenWorkId(work.id);
    window.history.pushState(window.history.state, "", `/works/${work.id}`);
  }, []);

  // 关闭：弹窗内发起 → history.back() 回列表 URL；浏览器后退（popstate）→ 只收覆盖层
  const closeDialog = useCallback(() => {
    setOpenWorkId(null);
    window.history.back();
  }, []);

  // 前台管理：删除后列表刷新（Build-E【2】/【5】）——移除该卡并修正 total
  const onCardDeleted = useCallback((work: WorkListItem) => {
    setEntries((prev) => prev.filter((e) => e.work.id !== work.id));
    setTotal((prev) => (prev != null ? Math.max(0, prev - 1) : prev));
    if (openRef.current === work.id) {
      setOpenWorkId(null);
      window.history.back();
    }
  }, []);

  // 弹窗内删除：与卡片删除同一刷新路径（onCardDeleted 已处理关弹窗 + history.back）
  const onDialogDeleted = useCallback(
    (id: string) => {
      const target = entriesRef.current.find((e) => e.work.id === id)?.work;
      if (target) onCardDeleted(target);
    },
    [onCardDeleted],
  );

  useEffect(() => {
    const onPopState = () => {
      if (openRef.current) setOpenWorkId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 空状态变体（5.9）：搜索 > 用户筛选 > 页面基础变体
  const emptyVariant: EmptyVariant = filters.q
    ? "search"
    : filtersActive(filters)
      ? "filter"
      : emptyBase;

  const grid =
    layout === "grid" ? (
      <div className="video-grid">
        {entries.map((entry) => (
          <div className="video-grid-item" key={entry.work.id}>
            <MasonryCard
              work={entry.work}
              enterDelayMs={entry.enterDelayMs}
              onOpen={openWork}
              onDeleted={onCardDeleted}
            />
          </div>
        ))}
      </div>
    ) : (
      <MasonryGrid entries={entries} onOpen={openWork} onDeleted={onCardDeleted} />
    );

  const skeleton =
    layout === "grid" ? <VideoGridSkeleton count={6} /> : <MasonrySkeleton count={12} />;

  return (
    <>
      <FilterBar
        filters={filters}
        albums={albums}
        tags={tags}
        total={total}
        unit={unit}
        hideAlbum={hideAlbum}
        hideTags={hideTags}
        onChange={applyFilters}
      />

      {phase === "loading" && entries.length === 0 ? skeleton : grid}

      {phase === "error" && entries.length === 0 && (
        <div className="grid-error-row">
          <span>作品加载失败，请确认后端服务已启动。</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchPage(null)}>
            重试
          </button>
        </div>
      )}

      {phase === "ready" && entries.length === 0 && (
        <EmptyState
          variant={emptyVariant}
          query={filters.q}
          ctaLabel={emptyVariant === "site" || emptyVariant === "album" ? undefined : "清除全部筛选"}
          onCta={
            emptyVariant === "site" || emptyVariant === "album"
              ? undefined
              : () => applyFilters({ tags: [], sort: filters.sort })
          }
        />
      )}

      <div ref={sentinelRef} className="load-sentinel" aria-hidden="true" />
      {loadingMore && <MasonrySkeletonSmall count={4} />}
      {phase === "ready" && entries.length > 0 && !hasMore && (
        <p className="grid-footer-note">
          已加载 {entries.length} / 共 {total ?? entries.length} {unit}作品
        </p>
      )}

      {openWorkId && (
        <WorkDialog
          initialId={openWorkId}
          filters={merged(filters)}
          onClose={closeDialog}
          onDeleted={onDialogDeleted}
        />
      )}
    </>
  );
}
