"use client";

/**
 * 快捷精选切换按钮（Build-H【1】）：
 * - 点击即 PATCH /api/admin/works/{id} {featured: !current}，无需进编辑页；
 * - 成功后 toast + 通过 onToggled 回调让上层即时更新（★ 高亮）；
 * - 401 → 跳登录页；与 WorkManageButtons 同一处（卡片右上角管理浮层 / 详情操作区）；
 * - compact：卡片浮层内小按钮（触控端 card-manage 常显，见 CSS，移动端可用）。
 * - Build-I【1】：compact 态用 card-pill-btn/card-pill-feature 统一胶囊按钮（★ 实心 / ☆ 描边）。
 */
import { usePathname, useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, toggleFeatured } from "@/lib/api";

interface Props {
  id: string;
  title: string;
  featured: boolean;
  /** 成功回调（传新的 featured 值），供列表/详情即时更新 */
  onToggled?: (next: boolean) => void;
  /** 紧凑态（卡片浮层用） */
  compact?: boolean;
  /** 阻止事件冒泡（卡片内嵌时避免触发打开 lightbox） */
  stopPropagation?: boolean;
}

export default function QuickFeatureButton({
  id,
  title,
  featured,
  onToggled,
  compact = false,
  stopPropagation = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onToggle = async (e: MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    if (busy) return;
    const next = !featured;
    setBusy(true);
    try {
      await toggleFeatured(id, next);
      toast.push(
        next ? `已设为精选「${title || id}」` : `已取消精选「${title || id}」`,
        "success",
      );
      onToggled?.(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      toast.push(err instanceof Error ? err.message : "操作失败", "error");
    } finally {
      setBusy(false);
    }
  };

  // Build-I【1】：卡片浮层内用统一胶囊按钮（card-pill-btn），详情区仍用常规按钮
  const btn = compact ? "card-pill-btn card-pill-feature" : "btn btn-secondary btn-sm";

  return (
    <button
      type="button"
      className={`${btn} quick-feature${featured ? " is-featured" : ""}`}
      disabled={busy}
      onClick={onToggle}
      aria-pressed={featured}
      title={featured ? "取消精选" : "设为精选"}
      aria-label={featured ? `取消精选 ${title || id}` : `设为精选 ${title || id}`}
    >
      <span aria-hidden="true">{featured ? "★" : "☆"}</span>
      {!compact && <span>{featured ? "已精选" : "设为精选"}</span>}
    </button>
  );
}
