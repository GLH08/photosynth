"use client";

/**
 * 前台管理按钮（Build-E【2】：管理融进前台）：
 * - 编辑：Link → /works/[id]/edit（WorkForm 编辑态，PATCH）；
 * - 删除（Build-G 语义）：按钮文案「移入回收站」，两步确认（第一次变「确认移入回收站?」
 *   Danger，4s 自动撤销；DELETE ?confirm=true → 软删除），成功后 toast + 回调
 *   onDeleted（列表页移除该卡 / 详情页回退）；作品可在 /trash 恢复或彻底删除。
 * 全站已登录保护下才可见；401 → 跳登录页。
 * - Build-I【1】：compact 态改为胶囊内图标按钮（编辑=铅笔 / 移入回收站=垃圾桶 / 确认=勾），
 *   与 QuickFeatureButton 的 ★ 统一尺寸；非 compact（详情区）仍为文字按钮。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, clientSend } from "@/lib/api";

interface Props {
  id: string;
  title: string;
  /** 删除成功后回调（默认 replace 回 /gallery） */
  onDeleted?: () => void;
  /** 紧凑态（卡片 hover 浮层用，小按钮） */
  compact?: boolean;
  /** 阻止事件冒泡（卡片内嵌时避免触发打开 lightbox） */
  stopPropagation?: boolean;
}

export default function WorkManageButtons({
  id,
  title,
  onDeleted,
  compact = false,
  stopPropagation = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (confirming) timer.current = setTimeout(() => setConfirming(false), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [confirming]);

  const stop = (e: MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  const onDelete = async (e: MouseEvent) => {
    stop(e);
    if (!confirming) {
      setConfirming(true); // 第一次点击：进入二次确认态
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await clientSend("DELETE", `/api/admin/works/${id}?confirm=true`);
      toast.push(`已移入回收站「${title || id}」，可在回收站恢复`, "success");
      if (onDeleted) onDeleted();
      else router.replace("/gallery");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      toast.push(err instanceof Error ? err.message : "删除失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const btn = compact ? "card-pill-btn" : "btn btn-secondary btn-sm";

  // Build-I【1】紧凑态（卡片浮层）：图标按钮（铅笔 / 垃圾桶 / 确认勾），与精选★统一胶囊尺寸
  if (compact) {
    return (
      <span className="manage-actions" onClick={stop} onKeyDown={(e) => e.stopPropagation()}>
        <Link
          href={`/works/${id}/edit`}
          className="card-pill-btn"
          onClick={stop}
          title="编辑"
          aria-label={`编辑作品 ${title || id}`}
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M13.2 3.3a1.9 1.9 0 0 1 2.7 2.7l-8.2 8.2-3.4.7.7-3.4 8.2-8.2Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <button
          type="button"
          className={`card-pill-btn card-pill-danger${confirming ? " is-confirming" : ""}`}
          disabled={busy}
          onClick={onDelete}
          title={confirming ? "确认移入回收站" : "移入回收站"}
          aria-label={confirming ? `确认移入回收站 ${title || id}` : `移入回收站 ${title || id}`}
        >
          {confirming ? (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M4.5 10.5 8 14l7.5-8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M4 6h12M8 6V4.6A1 1 0 0 1 9 3.6h2a1 1 0 0 1 1 1V6m-6 0 .7 9a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L15 6M8.5 9v5M11.5 9v5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </span>
    );
  }

  return (
    <span className="manage-actions" onClick={stop} onKeyDown={(e) => e.stopPropagation()}>
      <Link
        href={`/works/${id}/edit`}
        className={btn}
        onClick={stop}
        aria-label={`编辑作品 ${title || id}`}
      >
        编辑
      </Link>
      <button
        type="button"
        className={`${btn}${confirming ? " btn-danger" : ""}`}
        disabled={busy}
        onClick={onDelete}
        aria-label={confirming ? `确认移入回收站 ${title || id}` : `移入回收站 ${title || id}`}
      >
        {busy ? "处理中…" : confirming ? "确认移入回收站?" : "移入回收站"}
      </button>
    </span>
  );
}
