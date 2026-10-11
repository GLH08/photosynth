"use client";

/**
 * 回收站列表（Build-G）：客户端拉取 GET /api/admin/trash（管理端需 Cookie 认证，
 * SSR 无 Cookie，故不走 serverGet）。每项展示缩略图 + 标题 + 删除时间，
 * 可「恢复」或「彻底删除」（彻底删除走两步确认）。操作后本地移除该项。
 * 全站登录由 middleware 保护；401 → 跳登录页兜底。
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { ApiClientError, getTrash, purgeWork, restoreWork } from "@/lib/api";
import type { WorkListItem } from "@/lib/types";

const PAGE = 24;

/** ISO8601 → 「YYYY-MM-DD HH:MM」（只做展示，不做时区换算）。 */
function formatDeletedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.replace("T", " ").replace("Z", "").slice(0, 16);
}

function TrashRow({
  work,
  onRemoved,
}: {
  work: WorkListItem;
  onRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | "restore" | "purge">(null);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const guard = (err: unknown): boolean => {
    if (err instanceof ApiClientError && err.status === 401) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      return true;
    }
    return false;
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy("restore");
    try {
      await restoreWork(work.id);
      toast.push(`已恢复「${work.title || work.id}」`, "success");
      onRemoved(work.id);
      router.refresh();
    } catch (err) {
      if (!guard(err)) toast.push(err instanceof Error ? err.message : "恢复失败", "error");
    } finally {
      setBusy(null);
    }
  };

  const onPurge = async () => {
    if (busy) return;
    if (!confirming) {
      setConfirming(true); // 第一次点击：进入二次确认态
      return;
    }
    setConfirming(false);
    setBusy("purge");
    try {
      await purgeWork(work.id);
      toast.push(`已彻底删除「${work.title || work.id}」（不可恢复）`, "success");
      onRemoved(work.id);
      router.refresh();
    } catch (err) {
      if (!guard(err)) toast.push(err instanceof Error ? err.message : "删除失败", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="trash-row">
      <div className="trash-thumb">
        {/* 回收站内作品公开详情已 404，缩略图直接取外部 thumb_url */}
        <img
          src={work.thumb_url || work.media_url}
          alt={work.title || work.id}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="trash-info">
        <span className="trash-title">{work.title || "无题"}</span>
        <span className="trash-meta mono">
          {work.type === "video" ? "视频" : "图片"} · 删除于 {formatDeletedAt(work.deleted_at)}
        </span>
      </div>
      <div className="trash-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy !== null}
          onClick={onRestore}
        >
          {busy === "restore" ? "恢复中…" : "恢复"}
        </button>
        <button
          type="button"
          className={`btn btn-sm${confirming ? " btn-danger" : " btn-ghost"}`}
          disabled={busy !== null}
          onClick={onPurge}
          aria-label={confirming ? `确认彻底删除 ${work.title || work.id}` : `彻底删除 ${work.title || work.id}`}
        >
          {busy === "purge" ? "删除中…" : confirming ? "确认彻底删除?" : "彻底删除"}
        </button>
      </div>
    </li>
  );
}

export default function TrashClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<WorkListItem[] | null>(null); // null = 加载中
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await getTrash(PAGE, 0);
      setItems(page.items);
      setTotal(page.total);
      setMore(page.has_more);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setItems([]);
    }
  }, [pathname, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || !items) return;
    setLoadingMore(true);
    try {
      const page = await getTrash(PAGE, items.length);
      setItems([...items, ...page.items]);
      setTotal(page.total);
      setMore(page.has_more);
    } catch {
      /* 加载更多失败：静默，保留已加载项 */
    } finally {
      setLoadingMore(false);
    }
  };

  const onRemoved = (id: string) => {
    setItems((prev) => (prev ? prev.filter((w) => w.id !== id) : prev));
    setTotal((t) => Math.max(0, t - 1));
  };

  if (items === null) {
    return <p className="trash-hint">加载中…</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        variant="site"
        copy={{
          title: "回收站是空的",
          desc: "在画廊里把作品「移入回收站」后，会出现在这里，可随时恢复或彻底删除。",
        }}
      />
    );
  }

  return (
    <>
      <p className="trash-hint" role="status">
        共 {total} 项
      </p>
      <ul className="trash-list">
        {items.map((w) => (
          <TrashRow key={w.id} work={w} onRemoved={onRemoved} />
        ))}
      </ul>
      {more && (
        <div className="trash-more">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
    </>
  );
}
