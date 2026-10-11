"use client";

/**
 * 批量操作工具条（Build-H【2】）：
 * - 显示已选数量 + 全选本页 / 清空 / 退出选择；
 * - 操作按钮：设为精选 / 取消精选 / 移入专辑 / 加标签 / 移入回收站；
 * - 「移入专辑」「加标签」点击展开内联面板（原生 select / input，移动端友好）；
 * - sticky 在 Header 下方，滚动时始终可达；窄屏自动换行。
 */
import { useState } from "react";

import type { AlbumInfo, TagInfo } from "@/lib/types";

interface Props {
  count: number;
  total: number | null;
  unit: string;
  albums: AlbumInfo[];
  tags: TagInfo[];
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  onTrash: () => void;
  onFeature: () => void;
  onUnfeature: () => void;
  onMoveAlbum: (slug: string) => void;
  onAddTags: (slugs: string[]) => void;
}

function parseTagInput(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function BatchToolbar({
  count,
  total,
  unit,
  albums,
  tags,
  busy,
  onSelectAll,
  onClear,
  onExit,
  onTrash,
  onFeature,
  onUnfeature,
  onMoveAlbum,
  onAddTags,
}: Props) {
  const [panel, setPanel] = useState<null | "album" | "tags">(null);
  const [albumSlug, setAlbumSlug] = useState("");
  const [tagText, setTagText] = useState("");
  const none = count === 0;

  return (
    <div className="batch-bar" role="region" aria-label="批量操作">
      <div className="batch-bar-row">
        <span className="batch-count" role="status">
          已选 {count}
          {total != null ? ` / ${total} ${unit}` : ""}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onSelectAll}>
          全选本页
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || none}
          onClick={onClear}
        >
          清空
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onExit}>
          退出选择
        </button>
      </div>

      <div className="batch-bar-row batch-bar-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || none}
          onClick={onFeature}
        >
          设为精选 ★
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || none}
          onClick={onUnfeature}
        >
          取消精选
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-expanded={panel === "album"}
          disabled={busy || none}
          onClick={() => setPanel(panel === "album" ? null : "album")}
        >
          移入专辑
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-expanded={panel === "tags"}
          disabled={busy || none}
          onClick={() => setPanel(panel === "tags" ? null : "tags")}
        >
          加标签
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={busy || none}
          onClick={onTrash}
        >
          移入回收站
        </button>
      </div>

      {panel === "album" && (
        <div className="batch-panel">
          {albums.length > 0 ? (
            <select
              className="form-select"
              value={albumSlug}
              onChange={(e) => setAlbumSlug(e.target.value)}
              aria-label="选择目标专辑"
            >
              <option value="">选择专辑…</option>
              {albums.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="form-input"
              value={albumSlug}
              onChange={(e) => setAlbumSlug(e.target.value)}
              placeholder="专辑 slug"
              aria-label="目标专辑 slug"
            />
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !albumSlug}
            onClick={() => {
              onMoveAlbum(albumSlug);
              setPanel(null);
              setAlbumSlug("");
            }}
          >
            确定移入
          </button>
        </div>
      )}

      {panel === "tags" && (
        <div className="batch-panel">
          <input
            className="form-input"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="标签 slug，逗号分隔（追加不覆盖）"
            list="batch-tag-options"
            aria-label="要添加的标签 slug"
          />
          <datalist id="batch-tag-options">
            {tags.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </datalist>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !tagText.trim()}
            onClick={() => {
              onAddTags(parseTagInput(tagText));
              setPanel(null);
              setTagText("");
            }}
          >
            确定添加
          </button>
        </div>
      )}
    </div>
  );
}
