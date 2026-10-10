"use client";

/**
 * WorkDetailPanel（DESIGN 5.6 右信息栏 / 4.3-⑧ 详情页信息架构，弹窗与独立页复用）：
 * 标题 → 类型/精选徽章 → 提示词块（复制三级降级 + toast）→ 负向提示词（可折叠，null 隐藏）
 * → 参考图缩略网格（#N 角标、点击左区预览、失败降级链接）→ 模型/参数 kv 表（空字段整行隐藏）
 * → 操作区（下载/新窗口打开）→ 专辑链接卡与标签 chips。
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { copyText } from "@/lib/copy";
import { formatDuration, formatResolution } from "@/lib/api";
import type { WorkDetail } from "@/lib/types";
import { useToast } from "./Toast";

interface Props {
  work: WorkDetail;
  /** 参考图临时预览（回调给容器替换左媒体区） */
  previewUrl?: string | null;
  onPreviewRef?: (url: string | null) => void;
}

function KvTable({ rows }: { rows: [string, ReactNode][] }) {
  if (rows.length === 0) return null; // 全空则整块隐藏
  return (
    <section aria-label="模型与参数">
      <h3 className="detail-section-title">模型 / 参数</h3>
      <div className="kv-table">
        {rows.map(([k, v]) => (
          <div className="kv-row" key={k}>
            <span className="kv-key">{k}</span>
            <span className="kv-val">{v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function WorkDetailPanel({ work, previewUrl, onPreviewRef }: Props) {
  const toast = useToast();
  const [manualCopy, setManualCopy] = useState(false);
  const [failedRefs, setFailedRefs] = useState<Set<number>>(new Set());

  // ---- 提示词复制：三级降级（clipboard → execCommand → 手动全选 textarea）
  const copyPrompt = async () => {
    const level = await copyText(work.prompt);
    if (level) {
      setManualCopy(false);
      toast.push("已复制提示词", "success");
    } else {
      setManualCopy(true);
      toast.push("自动复制不可用，请手动复制", "warning");
    }
  };

  // ---- kv 表：固定字段 + parameters JSON 平铺；空字段整行隐藏
  const kvRows: [string, ReactNode][] = [];
  const push = (k: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return; // 空字段整行隐藏
    kvRows.push([k, String(v)]);
  };
  push("模型", work.model_name);
  push("版本", work.model_version);
  push("尺寸", formatResolution(work.width, work.height));
  if (work.type === "video") push("时长", formatDuration(work.duration_seconds));
  const params = work.parameters ?? {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "size") continue; // 与固定「尺寸」行重复
    if (value === null || value === undefined || value === "") continue;
    const display = typeof value === "object" ? JSON.stringify(value) : String(value);
    kvRows.push([key, display]);
  }
  push("发布", work.published_at ? work.published_at.slice(0, 10) : null);
  push("ID", work.id);

  const refs = work.reference_images ?? [];
  const anyRefFailed = refs.some((_, i) => failedRefs.has(i));

  return (
    <div className="detail-panel">
      {/* 1. 标题 + featured 星标 + 徽章 */}
      <div className="detail-head">
        <div className="detail-title-row">
          <h2 className="detail-title">{work.title || "无题"}</h2>
          {work.featured && (
            <span className="detail-star" title="精选" aria-label="精选">
              ★
            </span>
          )}
        </div>
        <div className="detail-badges">
          <span className={`badge badge-${work.type}`}>{work.type === "video" ? "视频" : "图片"}</span>
          <span className="badge" style={{ background: "var(--c-bg-sunken)", color: "var(--c-ink-500)" }}>
            <span className="mono">{formatResolution(work.width, work.height)}</span>
          </span>
          {work.type === "video" && work.duration_seconds != null && (
            <span className="badge" style={{ background: "var(--c-bg-sunken)", color: "var(--c-ink-500)" }}>
              <span className="mono">{formatDuration(work.duration_seconds)}</span>
            </span>
          )}
        </div>
        {work.description && <p className="detail-desc">{work.description}</p>}
      </div>

      {/* 2. 提示词块（可选中 + 复制按钮，三级降级） */}
      <section aria-label="提示词">
        <div className="prompt-block">
          <span className="prompt-label">Prompt</span>
          <button type="button" className="btn btn-ghost btn-sm btn-copy" onClick={copyPrompt}>
            复制
          </button>
          <pre>{work.prompt}</pre>
          {manualCopy && (
            <div className="manual-copy">
              <textarea
                readOnly
                defaultValue={work.prompt}
                aria-label="手动复制提示词"
                onFocus={(e) => e.currentTarget.select()}
                autoFocus
              />
              <p className="manual-hint">自动复制不可用：内容已全选，请按 Ctrl/Cmd+C 手动复制。</p>
            </div>
          )}
        </div>
      </section>

      {/* 3. 负向提示词（可折叠；null 整块隐藏） */}
      {work.negative_prompt && (
        <details className="neg-block">
          <summary>负向提示词</summary>
          <pre>{work.negative_prompt}</pre>
        </details>
      )}

      {/* 4. 参考图缩略网格（#N 角标、点击左区预览、失败降级链接） */}
      {refs.length > 0 && (
        <section aria-label="参考图">
          <h3 className="detail-section-title">参考图 · {refs.length}</h3>
          <div className="ref-grid">
            {refs.map((ref, i) =>
              failedRefs.has(i) ? (
                <a
                  key={ref.order ?? i}
                  className="ref-cell failed"
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={ref.url}
                >
                  链接 ↗
                </a>
              ) : (
                <button
                  key={ref.order ?? i}
                  type="button"
                  className={`ref-cell${previewUrl === ref.url ? " active" : ""}`}
                  aria-label={`预览参考图 #${ref.order ?? i + 1}`}
                  onClick={() => onPreviewRef?.(previewUrl === ref.url ? null : ref.url)}
                >
                  <span className="ref-order">#{ref.order ?? i + 1}</span>
                  <img
                    src={ref.thumb_url || ref.url}
                    alt={`参考图 #${ref.order ?? i + 1}`}
                    referrerPolicy="no-referrer"
                    decoding="async"
                    onError={() => setFailedRefs((prev) => new Set(prev).add(i))}
                  />
                </button>
              ),
            )}
          </div>
          {anyRefFailed && (
            <div className="ref-fallback-list">
              <span>缩略图加载失败，可直接访问原始链接：</span>
              {refs.map((ref, i) => (
                <a key={`url-${ref.order ?? i}`} href={ref.url} target="_blank" rel="noreferrer noopener">
                  #{ref.order ?? i + 1} {ref.url}
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. 模型/参数 kv 表 */}
      <KvTable rows={kvRows} />

      {/* 6. 操作区 */}
      <section aria-label="操作">
        <div className="detail-actions">
          <a
            className="btn btn-primary"
            href={work.media_url}
            download
            target="_blank"
            rel="noreferrer noopener"
          >
            下载原文件
          </a>
          <a className="btn btn-secondary" href={work.media_url} target="_blank" rel="noreferrer noopener">
            新窗口打开 ↗
          </a>
        </div>
      </section>

      {/* 7. 专辑链接卡 + 标签 chips */}
      {(work.album || work.tags.length > 0) && (
        <section aria-label="专辑与标签" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {work.album && (
            <Link href={`/albums/${work.album.slug}`} className="album-link-card">
              <span>
                <span className="album-link-name">{work.album.name}</span>
                <br />
                <span className="album-link-kind">专辑</span>
              </span>
              <span aria-hidden="true" style={{ color: "var(--c-ink-300)" }}>
                →
              </span>
            </Link>
          )}
          {work.tags.length > 0 && (
            <div className="tag-chips">
              {work.tags.map((t) => (
                <Link key={t.slug} href={`/tags/${t.slug}`} className="tag-chip">
                  #{t.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
