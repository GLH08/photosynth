"use client";

/**
 * MasonryCard（DESIGN 5.5，全站复用之王）：
 * - 媒体框内联 aspect-ratio 占位（杜绝 CLS），<img> contain 零裁切；
 * - loading=lazy decoding=async referrerpolicy=no-referrer；一律加载 thumb_url；
 * - onerror 回退 media_url 原图（一次为限，防循环）；再失败 sunken 衬底 + 断链图标 + 「查看原链」；
 * - 视频扩展位（5.7）：poster 封面 + 右下时长角标 + 中央播放浮标（网格内零视频请求）；
 * - featured ★ 琥珀金角标；整卡可点（role="link"，Enter 打开）；文本区可配置隐藏。
 */
import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { formatDuration, formatResolution } from "@/lib/api";
import type { WorkListItem } from "@/lib/types";

export type CardTextMode = "full" | "title" | "none";

interface Props {
  work: WorkListItem;
  textMode?: CardTextMode;
  /** 入场错峰动画延迟（5.10：逐张 30ms，上限 8 张，由网格层计算） */
  enterDelayMs?: number;
  onOpen?: (work: WorkListItem) => void;
}

export default function MasonryCard({ work, textMode = "full", enterDelayMs, onOpen }: Props) {
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

  const activate = () => onOpen?.(work);
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

  const visibleTags = work.tags.slice(0, 2);
  const extraTags = work.tags.length - visibleTags.length;

  return (
    <div
      className={`card-work${enterDelayMs != null ? " card-enter" : ""}`}
      style={enterDelayMs != null ? { animationDelay: `${enterDelayMs}ms` } : undefined}
      role="link"
      tabIndex={0}
      aria-label={`打开作品：${work.title || work.id}`}
      onClick={activate}
      onKeyDown={onKeyDown}
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
