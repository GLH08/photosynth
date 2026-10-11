"use client";

/**
 * MasonryGrid（DESIGN 5.5，Build-F【1】重写）：
 * 原实现用 CSS multi-column，存在两个用户可见问题：
 *  1) `column-fill: balance` 会在每次追加卡片后重新平衡所有列 → 已渲染卡片跳列（「错乱」）；
 *  2) 内容不足一屏时后面几列为空 → 「后续行最后一列空缺」。
 * 改为 JS 最短列分配（按 aspect-ratio 估算高度，逐张放入当前最矮列）：
 *  - 贪心分配对前缀稳定：追加新卡片不会改变已卡片的位置（不会跳列）；
 *  - 每列始终被填满，右侧不留空洞；
 *  - 阅读顺序近似从左到右逐行推进（列数由容器宽度断点决定）。
 * 列数在挂载前用 CSS 断点无法感知，故首帧按 SSR 默认 3 列渲染，useLayoutEffect 在
 * 首次绘制前按容器实际宽度校正（无可见闪动、无 hydration 不一致）。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import MasonryCard, { type CardTextMode } from "./MasonryCard";
import type { WorkListItem } from "@/lib/types";

export interface MasonryEntry {
  work: WorkListItem;
  enterDelayMs?: number;
}

interface Props {
  entries: MasonryEntry[];
  textMode?: CardTextMode;
  onOpen?: (work: WorkListItem) => void;
  onDeleted?: (work: WorkListItem) => void;
  /** Build-H【1】快捷精选切换回调 */
  onFeaturedChange?: (id: string, next: boolean) => void;
  /** Build-H【2】选择模式 */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (work: WorkListItem) => void;
  onLongPress?: (work: WorkListItem) => void;
}

/** 列数断点（与旧 CSS 一致：<640→2 / ≥1024→3 / ≥1280→4 / ≥1536→5） */
const BREAKPOINTS: [min: number, cols: number][] = [
  [1536, 5],
  [1280, 4],
  [1024, 3],
  [0, 2],
];

export function colsForWidth(width: number): number {
  for (const [min, cols] of BREAKPOINTS) {
    if (width >= min) return cols;
  }
  return 2;
}

/** 文本区高度折算成列高比例（列宽一致，故只需相对值）：full 有标题+提示词+元信息 */
const TEXT_RATIO: Record<CardTextMode, number> = { full: 0.5, title: 0.16, none: 0 };

/** 估算卡片高度（列宽归一）：媒体高宽比 + 文本区折算 */
function estimateHeight(work: WorkListItem, textMode: CardTextMode): number {
  const ratio = work.width > 0 ? work.height / work.width : 1;
  return (isFinite(ratio) && ratio > 0 ? ratio : 1) + TEXT_RATIO[textMode];
}

/** 把 entries 按最短列优先分到 cols 列（贪心，前缀稳定） */
export function distribute<T>(
  entries: T[],
  cols: number,
  heightOf: (entry: T) => number,
): T[][] {
  const buckets: T[][] = Array.from({ length: Math.max(1, cols) }, () => []);
  const heights = new Array(buckets.length).fill(0);
  for (const entry of entries) {
    let target = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (heights[i] < heights[target] - 1e-6) target = i;
    }
    buckets[target].push(entry);
    heights[target] += heightOf(entry);
  }
  return buckets;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function MasonryGrid({
  entries,
  textMode = "full",
  onOpen,
  onDeleted,
  onFeaturedChange,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onLongPress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3); // SSR 默认；挂载后按容器宽度校正

  useIsoLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCols(colsForWidth(el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(
    () => distribute(entries, cols, (entry) => estimateHeight(entry.work, textMode)),
    [entries, cols, textMode],
  );

  return (
    <div className="masonry-grid" ref={containerRef}>
      {columns.map((column, i) => (
        <div className="masonry-col" key={i}>
          {column.map((entry) => (
            <MasonryCard
              key={entry.work.id}
              work={entry.work}
              textMode={textMode}
              enterDelayMs={entry.enterDelayMs}
              onOpen={onOpen}
              onDeleted={onDeleted}
              onFeaturedChange={onFeaturedChange}
              selectMode={selectMode}
              selected={selectedIds?.has(entry.work.id) ?? false}
              onToggleSelect={onToggleSelect}
              onLongPress={onLongPress}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 入场错峰：批内第 i 张延迟 30ms，上限 8 张（5.10） */
export function staggerDelay(indexInBatch: number): number {
  return Math.min(indexInBatch, 7) * 30;
}
