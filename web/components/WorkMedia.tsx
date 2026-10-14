"use client";

/**
 * WorkMedia（DESIGN 5.6 左媒体区 / 5.7 播放器 / 4.3-⑧ 详情页复用）：
 * - 图片：先显示 thumb，原图加载完成无缝交叉淡入（180ms，只动 opacity）；
 * - 视频：<video controls preload="metadata" poster playsinline>，默认不自动播放；
 *   播放失败 → 错误衬底卡「视频无法播放」+ 新窗口打开原文件兜底；
 * - 参考图临时预览：previewUrl 有值时替换媒体区，点击回原媒体；
 * - fill=true（弹窗）时绝对定位 contain 充满；否则（独立页）自然尺寸居中。
 */
import { useState, type ReactNode } from "react";

import { cheveretoSrcset, cheveretoVariant } from "@/lib/chevereto";
import { DETAIL_SIZES } from "@/lib/responsive";
import type { WorkDetail } from "@/lib/types";

interface Props {
  work: Pick<
    WorkDetail,
    "type" | "title" | "media_url" | "thumb_url" | "poster_url" | "width" | "height"
  >;
  previewUrl?: string | null;
  onExitPreview?: () => void;
  fill?: boolean;
}

const FADE = "opacity 180ms cubic-bezier(.4,0,.2,1)";

export default function WorkMedia({ work, previewUrl, onExitPreview, fill = false }: Props) {
  const [fullLoaded, setFullLoaded] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  // 参考图临时预览（5.6-4：点击在左媒体区预览，再点回原媒体）
  if (previewUrl) {
    return (
      <div
        style={{ position: "relative", width: "100%", height: "100%", cursor: "zoom-out" }}
        onClick={onExitPreview}
        role="button"
        tabIndex={0}
        aria-label="返回原媒体"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExitPreview?.();
          }
        }}
      >
        <img
          src={previewUrl}
          alt="参考图预览"
          referrerPolicy="no-referrer"
          className={fill ? "media-fill media-fade-in" : undefined}
          style={
            fill
              ? undefined
              : { maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", marginInline: "auto" }
          }
        />
        <span className="card-duration-badge" style={{ cursor: "default" }}>
          参考图预览 · 点击回原媒体
        </span>
      </div>
    );
  }

  if (work.type === "video") {
    if (videoFailed) {
      return (
        <div className="media-error-card">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 7v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.4" r="1" fill="currentColor" />
          </svg>
          <strong>视频无法播放</strong>
          <span>外链可能已失效，或当前浏览器不支持该编码。</span>
          <a className="btn btn-secondary btn-sm" href={work.media_url} target="_blank" rel="noreferrer noopener">
            在新窗口打开原文件 ↗
          </a>
        </div>
      );
    }
    return (
      <video
        key={work.media_url}
        controls
        preload="metadata"
        playsInline
        poster={work.poster_url ?? work.thumb_url}
        src={work.media_url}
        className={fill ? "media-fill media-fade-in" : "media-fade-in"}
        style={fill ? undefined : { maxWidth: "100%", maxHeight: "78vh", marginInline: "auto" }}
        onError={() => setVideoFailed(true)}
        aria-label={work.title || "视频作品"}
      />
    );
  }

  // 图片：thumb 打底 + 原图交叉淡入（加载失败保留 thumb，仍是全貌）
  // Build-M1：打底层改用 `.md` 变体（比原图小两个数量级），原图仍是 media_url。
  // Build-M2：原图 <img> 加 srcset（.md 500w + 原图 Nw）——无内联宽高、依赖固有比例，
  // 故排除方形裁切的 .th；移动端可命中 .md，桌面拿下原图。
  const fullSrcSet = cheveretoSrcset(work.media_url, work.width, ["md"]);
  const stack: ReactNode = (
    <>
      <img
        src={cheveretoVariant(work.thumb_url || work.media_url, "md")}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        decoding="async"
        className={fill ? "media-fill" : undefined}
        style={
          fill
            ? { opacity: fullLoaded ? 0 : 1, transition: FADE, pointerEvents: "none" }
            : {
                maxWidth: "100%",
                maxHeight: "78vh",
                objectFit: "contain",
                marginInline: "auto",
                opacity: fullLoaded ? 0 : 1,
                transition: FADE,
              }
        }
      />
      <img
        src={work.media_url}
        srcSet={fullSrcSet}
        sizes={fullSrcSet ? DETAIL_SIZES : undefined}
        alt={work.title || "作品原图"}
        referrerPolicy="no-referrer"
        decoding="async"
        onLoad={() => setFullLoaded(true)}
        className={fill ? "media-fill" : undefined}
        style={
          fill
            ? { opacity: fullLoaded ? 1 : 0, transition: FADE }
            : {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                opacity: fullLoaded ? 1 : 0,
                transition: FADE,
              }
        }
      />
    </>
  );

  if (fill) {
    return <div style={{ position: "relative", width: "100%", height: "100%" }}>{stack}</div>;
  }
  return (
    <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>{stack}</div>
  );
}
