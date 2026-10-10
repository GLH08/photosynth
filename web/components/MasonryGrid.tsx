"use client";

/**
 * MasonryGrid（DESIGN 5.5）：CSS multi-column 瀑布流容器。
 * 列数由 CSS 断点驱动（<640→2 / ≥1024→3 / ≥1280→4 / ≥1536→5）；
 * entries 携带入场错峰延迟（5.10：30ms 逐张，上限 8 张，由调用方计算）。
 */
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
}

export default function MasonryGrid({ entries, textMode = "full", onOpen }: Props) {
  return (
    <div className="masonry">
      {entries.map((entry) => (
        <div className="masonry-item" key={entry.work.id}>
          <MasonryCard
            work={entry.work}
            textMode={textMode}
            enterDelayMs={entry.enterDelayMs}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  );
}

/** 入场错峰：批内第 i 张延迟 30ms，上限 8 张（5.10） */
export function staggerDelay(indexInBatch: number): number {
  return Math.min(indexInBatch, 7) * 30;
}
