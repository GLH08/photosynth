"use client";

/**
 * MasonryCard（DESIGN 5.5，全站复用之王）：
 * - 媒体框内联 aspect-ratio 占位（杜绝 CLS），<img> contain 零裁切；
 * - loading=lazy decoding=async referrerpolicy=no-referrer；一律加载 thumb_url；
 * - onerror 回退 media_url 原图（一次为限，防循环）；再失败 sunken 衬底 + 断链图标 + 「查看原链」；
 * - 视频扩展位（5.7）：poster 封面 + 右下时长角标 + 中央播放浮标（网格内零视频请求）；
 * - featured ★ 琥珀金角标；整卡可点（role="link"，Enter 打开）；文本区可配置隐藏；
 * - Build-H【1】右上角管理浮层内置快捷精选切换（★/☆）；
 * - Build-H【2】选择模式：卡片显示勾选框，点卡片切换选中；长按（触屏/鼠标）进入选择模式。
 * - Build-I【1】管理浮层重做为统一毛玻璃胶囊按钮组（★/编辑/移入回收站）；
 *   Build-I【2】选择模式左上角复选框 + 选中钴蓝描边高亮。
 */
import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

import { formatDuration, formatResolution } from "@/lib/api";
import type { WorkListItem } from "@/lib/types";
import QuickFeatureButton from "./QuickFeatureButton";
import WorkManageButtons from "./WorkManageButtons";

export type CardTextMode = "full" | "title" | "none";

const LONG_PRESS_MS = 450;

interface Props {
  work: WorkListItem;
  textMode?: CardTextMode;
  /** 入场错峰动画延迟（5.10：逐张 30ms，上限 8 张，由网格层计算） */
  enterDelayMs?: number;
  onOpen?: (work: WorkListItem) => void;
  /** 删除成功后回调（列表移除该卡；不传则默认回 /gallery） */
  onDeleted?: (work: WorkListItem) => void;
  /** Build-H【1】快捷精选切换成功后回调（列表/详情即时更新 ★） */
  onFeaturedChange?: (id: string, next: boolean) => void;
  /** Build-H【2】选择模式：点卡片切换选中、显示勾选框 */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (work: WorkListItem) => void;
  /** Build-H【2】长按卡片进入选择模式（移动端友好） */
  onLongPress?: (work: WorkListItem) => void;
}

export default function MasonryCard({
  work,
  textMode = "full",
  enterDelayMs,
  onOpen,
  onDeleted,
  onFeaturedChange,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onLongPress,
}: Props) {
  const isVideo = work.type === "video";
  // 图片：thumb → media_url 一次回退 → 断链兜底；
  // 视频（5.7）：卡片显示 poster_url 海报（网格内零视频请求），失败退 thumb 再退 media。
  const candidates = (
    isVideo
      ? [work.poster_url, work.thumb_url, work.media_url]
      : [work.thumb_url, work.media_url]
  ).filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);
  const [srcIdx, setSrcIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = candidates[srcIdx] ?? work.media_url;

  const onImgError = () => {
    if (srcIdx + 1 < candidates.length) {
      setSrcIdx(srcIdx + 1); // 回退下一候选（一次为限，防循环）
    } else {
      setFailed(true);
    }
  };

  const activate = () => {
    if (selectMode) {
      onToggleSelect?.(work);
      return;
    }
    onOpen?.(work);
  };

  // Build-H【2】长按进入选择模式：按下计时，松开/移出/移动取消；长按后抑制随后的 click
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (selectMode) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longFired.current = true;
      onLongPress?.(work);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const s = pressStart.current;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) clearPress();
  };

  const onClick = () => {
    if (longFired.current) {
      longFired.current = false; // 长按已进入选择模式，吞掉这次 click
      return;
    }
    activate();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
  const stopThen = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const stopPointer = (e: PointerEvent) => e.stopPropagation(); // 管理浮层内长按不触发卡片选择

  const visibleTags = work.tags.slice(0, 2);
  const extraTags = work.tags.length - visibleTags.length;

  return (
    <div
      className={`card-work${enterDelayMs != null ? " card-enter" : ""}${
        selectMode ? " select-mode" : ""
      }${selected ? " card-selected" : ""}`}
      style={enterDelayMs != null ? { animationDelay: `${enterDelayMs}ms` } : undefined}
      role={selectMode ? "checkbox" : "link"}
      aria-checked={selectMode ? selected : undefined}
      tabIndex={0}
      aria-label={
        selectMode
          ? `${selected ? "取消选中" : "选中"}作品：${work.title || work.id}`
          : `打开作品：${work.title || work.id}`
      }
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      data-work-id={work.id}
    >
      <div className="card-media" style={{ aspectRatio: `${work.width} / ${work.height}` }}>
        {failed ? (
          <div className="card-broken">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5m7 0L14 7a3.5 3.5 0 0 1 5 5l-2.5 2.5m-7 0 7-7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                transform="translate(1.5 -1)"
              />
            </svg>
            <span>图片加载失败</span>
            <a
              href={work.media_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={stopThen(() => undefined)}
            >
              查看原链 ↗
            </a>
          </div>
        ) : (
          <img
            src={src}
            alt={work.title || work.prompt}
            width={work.width}
            height={work.height}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={onImgError}
          />
        )}

        {work.featured && (
          <span className="card-featured-badge" aria-label="精选">
            ★ 精选
          </span>
        )}

        {/* Build-H【2】/Build-I【2】选择模式勾选框：空心圆 → 打勾 */}
        {selectMode && (
          <span className={`card-select-box${selected ? " on" : ""}`} aria-hidden="true">
            {selected && (
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.5 8.5 6.5 11.3 12.5 4.8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        )}

        {/* 视频扩展位（5.7）：时长角标 + 播放浮标；网格内绝不加载视频本体 */}
        {isVideo && (
          <>
            {work.duration_seconds != null && (
              <span className="card-duration-badge">{formatDuration(work.duration_seconds)}</span>
            )}
            <span className="card-play-float" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M8 5.5 17 11 8 16.5 Z" fill="currentColor" />
              </svg>
            </span>
          </>
        )}

        {/* 前台管理：hover 出精选/编辑/删除（Build-E【2】/ Build-H【1】；触控端常显，见 CSS） */}
        {!selectMode && (
          <span
            className="card-manage"
            onClick={stopThen(() => undefined)}
            onPointerDown={stopPointer}
          >
            <QuickFeatureButton
              id={work.id}
              title={work.title}
              featured={work.featured}
              compact
              stopPropagation
              onToggled={(next) => onFeaturedChange?.(work.id, next)}
            />
            <WorkManageButtons
              id={work.id}
              title={work.title}
              compact
              stopPropagation
              onDeleted={onDeleted ? () => onDeleted(work) : undefined}
            />
          </span>
        )}
      </div>

      {textMode !== "none" && (
        <div className="card-body">
          <div className="card-title" title={work.title || undefined}>
            {work.title || "无题"}
          </div>
          {textMode === "full" && (
            <>
              <p className="card-prompt">{work.prompt}</p>
              <div className="card-meta">
                {[
                  work.model_name || null,
                  isVideo && work.duration_seconds != null
                    ? `${formatDuration(work.duration_seconds)} · ${formatResolution(work.width, work.height)}`
                    : formatResolution(work.width, work.height),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {work.tags.length > 0 && (
                <div className="card-tags">
                  {visibleTags.map((t) => (
                    <span key={t.slug} className="mini-chip">
                      {t.name}
                    </span>
                  ))}
                  {extraTags > 0 && <span className="mini-chip more">+{extraTags}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
