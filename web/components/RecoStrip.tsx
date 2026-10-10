"use client";

/** 详情页底部推荐条（同专辑/相关标签作品，横向滚动小卡，点击进入对应作品页）。 */
import { useRouter } from "next/navigation";

import MasonryCard from "./MasonryCard";
import type { WorkListItem } from "@/lib/types";

interface Props {
  title: string;
  items: WorkListItem[];
}

export default function RecoStrip({ title, items }: Props) {
  const router = useRouter();
  if (items.length === 0) return null;

  return (
    <section className="page-section" aria-label={title}>
      <h2 className="detail-section-title">{title}</h2>
      <div className="reco-strip">
        {items.map((work) => (
          <div className="reco-item" key={work.id}>
            <MasonryCard
              work={work}
              textMode="title"
              onOpen={(w) => router.push(`/works/${w.id}`)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
