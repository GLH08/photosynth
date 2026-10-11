"use client";

/**
 * 作品列表客户端编排层（DESIGN 4.3-②/③/⑤/⑦ 复用）：
 * - FilterBar chips 变更 → URL query 同步（history.replaceState，可分享）→ 清空重载 + 回滚顶部；
 * - Build-F【1】两种浏览模式（URL query 同步、刷新不丢失）：
 *     scroll = 连续滚动（IntersectionObserver + cursor 无限加载）；
 *     paged  = 传统页码（page offset 分页，每页 48 张，可随机跳页）；
 * - Build-F【1】排序：latest / oldest / name（名称自然排序由后端 SQL 完成）；
 * - 点击卡片 → WorkDialog 覆盖层 + history.pushState('/works/[id]') URL 同步；
 *   关闭时 history.back()；浏览器后退（popstate）直接收起覆盖层，不重复回退；
 * - 空状态文案变体；多形态：mediaType=image|video；layout=masonry|grid；
 *   baseFilters 为页面锁定筛选（专辑/标签详情页），始终并入请求且不可被清除。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EmptyState, { type EmptyVariant } from "./EmptyState";
import FilterBar from "./FilterBar";
import MasonryCard from "./MasonryCard";
import MasonryGrid, { staggerDelay, type MasonryEntry } from "./MasonryGrid";
import Pagination from "./Pagination";
import { MasonrySkeleton, MasonrySkeletonSmall, VideoGridSkeleton } from "./Skeleton";
import WorkDialog from "./WorkDialog";
import { PAGE_SIZE, buildWorksQuery, clientGet, listUrlFromFilters } from "@/lib/api";
import type {
  AlbumInfo,
  BrowseMode,
  GalleryFilters,
  TagInfo,
  ViewState,
  WorkListItem,
  WorksPage,
  WorkType,
} from "@/lib/types";
import { filtersActive } from "@/lib/types";

interface Props {
  initialData: WorksPage | null; // SSR 首屏（后端不可达时为 null，客户端补拉）
  initialFilters: GalleryFilters;
  /** Build-F【1】SSR 浏览状态（mode/page） */
  initialView?: ViewState;
  /** 未给 initialView 时的默认模式 */
  defaultMode?: BrowseMode;
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
  initialView,
  defaultMode = "scroll",
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
  const startView: ViewState = initialView ?? { mode: defaultMode, page: 1 };

  const [filters, setFilters] = useState<GalleryFilters>(initialFilters);
  const [mode, setMode] = useState<BrowseMode>(startView.mode);
  const [page, setPage] = useState<number>(startView.page);
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

  const cursorRef = useRef<string | null>(initialData?.next_cursor ?? null);
  const hasMoreRef = useRef(initialData?.has_more ?? false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pageRef = useRef(page);
  pageRef.current = page;
  const openRef = useRef<string | null>(null);
  openRef.current = openWorkId;
  const entriesRef = useRef<MasonryEntry[]>([]);
  entriesRef.current = entries;
  const inFlight = useRef(false); // 仅约束「加载更多」单飞；整页重载按 reqSeq 丢弃过期响应
  const reqSeq = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(Boolean(initialData));

  /** 锁定筛选并入（base 优先，用户不可清除） */
  const merged = useCallback(
    (f: GalleryFilters): GalleryFilters => ({ ...f, ...baseFilters }),
    [baseFilters],
  );

  /** URL query 同步（筛选 + 浏览模式 + 页码） */
  const syncUrl = useCallback(
    (f: GalleryFilters, m: BrowseMode, p: number) => {
      window.history.replaceState(
        window.history.state,
        "",
        listUrlFromFilters(basePath, merged(f), { mode: m, page: p }),
      );
    },
    [basePath, merged],
  );

  /**
   * 取一页数据。append=true 为连续滚动的追加；否则整页替换
   * （筛选变更 / 切换模式 / 跳页）。
   */
  const runFetch = useCallback(
    async (params: { cursor?: string | null; page?: number }, append: boolean) => {
      // Build-E【1】：单飞检查必须在占序号之前——否则 observer 在加载中再次触发时，
      // seq 空转 + 直接返回，会把正在飞的正常响应判为过期丢弃，列表永久停滞（提前终止）。
      if (append && inFlight.current) return;
      const seq = ++reqSeq.current; // 过期响应按序号丢弃（快速切换筛选不串页）
      if (append) {
        inFlight.current = true;
        setLoadingMore(true);
      }
      try {
        const qs = buildWorksQuery({
          ...merged(filtersRef.current),
          type: mediaType,
          limit: PAGE_SIZE,
          cursor: params.cursor ?? null,
          page: params.page,
        });
        const res = await clientGet<WorksPage>(`/api/works?${qs}`);
        if (seq !== reqSeq.current) return;
        cursorRef.current = res.next_cursor;
        hasMoreRef.current = res.has_more;
        setHasMore(res.has_more);
        setTotal(res.total);
        setEntries((prev) =>
          append ? [...prev, ...toEntries(res.items)] : toEntries(res.items),
        );
        setPhase("ready");
      } catch {
        if (seq !== reqSeq.current) return;
        setPhase((prev) => (append ? prev : "error"));
      } finally {
        if (append) {
          inFlight.current = false;
          setLoadingMore(false);
        }
      }
    },
    [merged, mediaType],
  );

  /** 整页重载：清空 → 骨架 → 请求 → 回滚顶部 */
  const reload = useCallback(
    (nextFilters: GalleryFilters, nextMode: BrowseMode, nextPage: number) => {
      cursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
      setEntries([]);
      setTotal(null);
      setPhase("loading");
      syncUrl(nextFilters, nextMode, nextPage);
      window.scrollTo({ top: 0, behavior: "auto" });
      void runFetch(
        nextMode === "paged" ? { page: nextPage } : { cursor: null },
        false,
      );
    },
    [runFetch, syncUrl],
  );

  // Build-E【4】：同路由 query 导航同步（Header 搜索整页跳转 / 页码 URL 直开）。
  // App Router 同路由 query 变化会重跑 page（initialFilters/initialView 更新）但
  // useState 不跟进，此处检测到外部状态变化 → 直接采用 SSR 数据重置列表。
  const extKey = JSON.stringify([initialFilters, startView]);
  useEffect(() => {
    const curKey = JSON.stringify([filtersRef.current, { mode: modeRef.current, page: pageRef.current }]);
    if (curKey === extKey) return;
    setFilters(initialFilters);
    filtersRef.current = initialFilters;
    setMode(startView.mode);
    modeRef.current = startView.mode;
    setPage(startView.page);
    pageRef.current = startView.page;
    cursorRef.current = initialData?.next_cursor ?? null;
    hasMoreRef.current = initialData?.has_more ?? false;
    setHasMore(initialData?.has_more ?? false);
    setTotal(initialData?.total ?? null);
    setEntries(initialData ? toEntries(initialData.items) : []);
    setPhase(initialData ? "ready" : "loading");
    window.scrollTo({ top: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extKey]);

  // SSR 不可达时客户端补拉首屏
  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void runFetch(
        modeRef.current === "paged" ? { page: pageRef.current } : { cursor: null },
        false,
      );
    }
  }, [runFetch]);

  // 筛选变更：URL 同步 + cursor 清空重载 + 回滚顶部（5.8）；分页模式回第 1 页
  const applyFilters = useCallback(
    (next: GalleryFilters) => {
      setFilters(next);
      filtersRef.current = next;
      setPage(1);
      pageRef.current = 1;
      reload(next, modeRef.current, 1);
    },
    [reload],
  );

  // Build-F【1】浏览模式切换：保留筛选与排序，回到第 1 页并重载
  const changeMode = useCallback(
    (nextMode: BrowseMode) => {
      if (nextMode === modeRef.current) return;
      setMode(nextMode);
      modeRef.current = nextMode;
      setPage(1);
      pageRef.current = 1;
      reload(filtersRef.current, nextMode, 1);
    },
    [reload],
  );

  // Build-F【1】跳页（分页模式）
  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      pageRef.current = nextPage;
      reload(filtersRef.current, "paged", nextPage);
    },
    [reload],
  );

  // 越界页兜底：筛选后总数变少导致当前页为空 → 回第 1 页（页码控件已收敛，直开 URL 也能自愈）
  useEffect(() => {
    if (
      phase === "ready" &&
      mode === "paged" &&
      page > 1 &&
      entries.length === 0 &&
      (total ?? 0) > 0
    ) {
      goToPage(1);
    }
  }, [phase, mode, page, entries.length, total, goToPage]);

  // 无限滚动：IntersectionObserver + cursor（仅连续滚动模式）
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (
          records[0]?.isIntersecting &&
          modeRef.current === "scroll" &&
          hasMoreRef.current &&
          !inFlight.current
        ) {
          void runFetch({ cursor: cursorRef.current }, true);
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [runFetch]);

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

  // 详情弹窗内点专辑卡：收起覆盖层（不 history.back()，避免与跳转竞态）后硬跳转专辑页
  const openAlbum = useCallback((slug: string) => {
    setOpenWorkId(null);
    window.location.assign(`/albums/${slug}`);
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

  const totalPages = useMemo(
    () => (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1),
    [total],
  );

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
        mode={mode}
        onModeChange={changeMode}
      />

      {phase === "loading" && entries.length === 0 ? skeleton : grid}

      {phase === "error" && entries.length === 0 && (
        <div className="grid-error-row">
          <span>作品加载失败，请确认后端服务已启动。</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => runFetch({ cursor: null }, false)}
          >
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

      {mode === "scroll" ? (
        <>
          <div ref={sentinelRef} className="load-sentinel" aria-hidden="true" />
          {loadingMore && <MasonrySkeletonSmall count={4} />}
          {phase === "ready" && entries.length > 0 && !hasMore && (
            <p className="grid-footer-note">
              已加载 {entries.length} / 共 {total ?? entries.length} {unit}作品
            </p>
          )}
        </>
      ) : (
        <Pagination
          page={page}
          pages={totalPages}
          onChange={goToPage}
          info={total != null ? `共 ${total} ${unit}作品 · 第 ${page} / ${totalPages} 页` : undefined}
        />
      )}

      {openWorkId && (
        <WorkDialog
          initialId={openWorkId}
          filters={merged(filters)}
          onClose={closeDialog}
          onDeleted={onDialogDeleted}
          onAlbumClick={openAlbum}
        />
      )}
    </>
  );
}
