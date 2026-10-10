"use client";

/**
 * 首页精选作品横滑 rail（DESIGN 4.3-①，M5）：
 * featured=1 大卡横向滚动（媒体 + 标题，textMode="title"），点击进入 /works/[id]。
 * 无自动轮播（5.10 纪律）；移动端原生横滑。
 */
import { useRouter } from "next/navigation";

import MasonryCard from "./MasonryCard";
import type { WorkListItem } from "@/lib/types";

interface Props {
  items: WorkListItem[];
}

export default function FeaturedRail({ items }: Props) {
  const router = useRouter();
  if (items.length === 0) return null;

  return (
    <div className="featured-rail" role="list" aria-label="精选作品，横向滚动">
      {items.map((work) => (
        <div className="rail-item" key={work.id} role="listitem">
          <MasonryCard
            work={work}
            textMode="title"
            onOpen={(w) => router.push(`/works/${w.id}`)}
          />
        </div>
      ))}
    </div>
  );
}
