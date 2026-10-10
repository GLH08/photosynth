"use client";

/**
 * 前台管理按钮（Build-E【2】：管理融进前台）：
 * - 编辑：Link → /works/[id]/edit（WorkForm 编辑态，PATCH）；
 * - 删除：两步确认（第一次变「确认删除?」Danger，4s 自动撤销；DELETE ?confirm=true），
 *   成功后 toast + 回调 onDeleted（列表页移除该卡 / 详情页回退）。
 * 全站已登录保护下才可见；401 → 跳登录页。
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
      toast.push(`已删除「${title || id}」（外部存储文件保留）`, "success");
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

  const btn = compact ? "btn btn-sm" : "btn btn-secondary btn-sm";

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
        aria-label={confirming ? `确认删除作品 ${title || id}` : `删除作品 ${title || id}`}
      >
        {busy ? "删除中…" : confirming ? "确认删除?" : "删除"}
      </button>
    </span>
  );
}
