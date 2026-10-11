"use client";

/**
 * WorkDialog（DESIGN 5.6 Lightbox 双栏弹窗）：
 * - 遮罩 rgba(24,22,19,.58) + blur(6px)，点击关闭；打开时 body 滚动锁定；
 * - 桌面双栏：左媒体区（flex:1，sunken 衬底）+ 右信息栏 380px（md 340px）独立滚动；
 * - 移动端（<768px）：底部抽屉——媒体区 60vh 在上（sm 65vh）、信息栏在下，grabber + 下滑关闭；
 * - ←/→ 切换 prev_id/next_id（数据来自详情 API，同筛选序列）、Esc 关闭；
 * - 切换时 history.replaceState 同步 /works/[id]（打开时的 pushState 由页面层负责）；
 * - 媒体区交叉淡入 180ms；参考图点击临时预览。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

import { buildDetailQuery, clientGet } from "@/lib/api";
import type { GalleryFilters, WorkDetailResponse } from "@/lib/types";
import { DetailSkeleton } from "./Skeleton";
import WorkDetailPanel from "./WorkDetailPanel";
import WorkMedia from "./WorkMedia";

interface Props {
  initialId: string;
  filters: GalleryFilters;
  /** 弹窗内发起的关闭（Esc/遮罩/×/下滑）；页面层负责 history.back() */
  onClose: () => void;
  /** 弹窗内删除成功后回调（页面层移除该卡） */
  onDeleted?: (id: string) => void;
  /** Build-F【3】点专辑信息卡 → 跳转专辑页（页面层负责收起覆盖层 + 导航） */
  onAlbumClick?: (slug: string) => void;
}

export default function WorkDialog({ initialId, filters, onClose, onDeleted, onAlbumClick }: Props) {
  const [currentId, setCurrentId] = useState(initialId);
  const [data, setData] = useState<WorkDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const reqSeq = useRef(0);
  const dataRef = useRef<WorkDetailResponse | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  dataRef.current = data;

  const load = useCallback(async (id: string) => {
    const seq = ++reqSeq.current; // 快速 ←/→ 时只认最后一次请求
    setLoadError(null);
    try {
      const qs = buildDetailQuery(filters);
      const res = await clientGet<WorkDetailResponse>(
        `/api/works/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
      );
      if (seq !== reqSeq.current) return;
      setData(res);
      setPreviewUrl(null);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setLoadError(e instanceof Error ? e.message : "加载失败");
    }
  }, [filters]);

  useEffect(() => {
    void load(currentId);
  }, [currentId, load]);

  // ←/→ 切换（URL replaceState 同步）、Esc 关闭
  const navigate = useCallback(
    (dir: "prev" | "next") => {
      const d = dataRef.current;
      const target = dir === "prev" ? d?.prev_id : d?.next_id;
      if (!target || target === currentId) return;
      setCurrentId(target);
      // 保留 Next 内部 history state，仅换 URL（切换不占后退栈）
      window.history.replaceState(window.history.state, "", `/works/${target}`);
    },
    [currentId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        navigate("prev");
      } else if (e.key === "ArrowRight") {
        navigate("next");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, navigate]);

  // body 滚动锁定 + 焦点管理（M6 无障碍）：记住触发元素，关闭后归还焦点
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add("scroll-locked");
    panelRef.current?.focus();
    return () => {
      document.body.classList.remove("scroll-locked");
      previous?.focus?.();
    };
  }, []);

  // focus trap：Tab / Shift+Tab 在面板内循环，不逃逸到背景页面
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';
  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // 移动端抽屉下滑关闭手势
  const onTouchStart = (e: ReactTouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (dragStart.current == null) return;
    setDragY(Math.max(0, e.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    if (dragY > 80) onClose();
    dragStart.current = null;
    setDragY(0);
  };

  const work = data?.work ?? null;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={work ? `作品详情：${work.title || work.id}` : "作品详情"}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="dialog-grabber"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-hidden="true"
        />

        {/* 左媒体区 */}
        <div className="dialog-media" key={currentId /* 切换作品重挂载 → 交叉淡入 */}>
          {work ? (
            <>
              <WorkMedia work={work} previewUrl={previewUrl} onExitPreview={() => setPreviewUrl(null)} fill />
              <div className="dialog-media-info">
                <span className={`badge badge-${work.type}`} style={{ padding: "1px 8px" }}>
                  {work.type === "video" ? "视频" : "图片"}
                </span>
                <span>
                  {work.width}×{work.height}
                  {work.duration_seconds != null && ` · ${Math.round(work.duration_seconds)}s`}
                </span>
              </div>
              <button
                type="button"
                className="dialog-nav prev"
                aria-label="上一幅（←）"
                disabled={!data?.prev_id}
                onClick={() => navigate("prev")}
              >
                ‹
              </button>
              <button
                type="button"
                className="dialog-nav next"
                aria-label="下一幅（→）"
                disabled={!data?.next_id}
                onClick={() => navigate("next")}
              >
                ›
              </button>
            </>
          ) : (
            !loadError && <DetailSkeleton />
          )}
          {loadError && (
            <div className="media-error-card">
              <strong>作品加载失败</strong>
              <span>{loadError}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => load(currentId)}>
                重试
              </button>
            </div>
          )}
        </div>

        {/* 顶部右浮：关闭 ×（44px 命中区） */}
        <div className="dialog-top-actions">
          <button type="button" className="icon-btn" aria-label="关闭（Esc）" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5 15 15 M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 右信息栏（独立滚动） */}
        <div className="dialog-info">
          {work ? (
            <WorkDetailPanel
              work={work}
              previewUrl={previewUrl}
              onPreviewRef={setPreviewUrl}
              manage
              onAlbumClick={onAlbumClick}
              onDeleted={(id) => {
                onDeleted?.(id);
                onClose();
              }}
            />
          ) : loadError ? (
            <div className="dialog-skeleton">
              <p style={{ color: "var(--c-danger)", fontSize: 14 }}>作品加载失败：{loadError}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => load(currentId)}>
                重试
              </button>
            </div>
          ) : (
            <DetailSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}
