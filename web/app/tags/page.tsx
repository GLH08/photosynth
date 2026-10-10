/**
 * /tags 标签云索引（DESIGN 4.3-⑥，M5）：
 * chips 按作品数降序（API 已排序），字号 14→22px / 色深按热度加权映射；点击进聚合页。
 * SSR + 60s ISR。
 */
import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";
import { getTags } from "@/lib/api";
import type { TagInfo } from "@/lib/types";

export const metadata: Metadata = {
  title: "标签",
  description: "全部标签索引——字号与色深映射作品热度，点击进入标签聚合页。",
};

export const revalidate = 60;

/** 热度映射（count → 字号 14–22px + 三级色深，DESIGN 4.3-⑥） */
function heatStyle(tag: TagInfo, max: number): React.CSSProperties {
  const t = max > 0 ? tag.count / max : 0;
  const fontSize = `${Math.round(14 + t * 8)}px`;
  if (t > 0.66) {
    return {
      fontSize,
      color: "var(--c-primary-700)",
      background: "var(--c-primary-100)",
      borderColor: "var(--c-primary-300)",
    };
  }
  if (t > 0.33) {
    return { fontSize, color: "var(--c-primary-600)", background: "var(--c-primary-50)" };
  }
  return { fontSize, color: "var(--c-ink-700)" };
}

export default async function TagsPage() {
  const tags = await getTags();
  const max = tags.reduce((m, t) => Math.max(m, t.count), 1);

  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Tags</p>
        <h1 className="page-title">标签</h1>
        <p className="page-desc">
          按热度陈列的全部标签：字号越大、颜色越深，作品越多。点击进入标签聚合页。
        </p>
      </header>

      {tags.length > 0 ? (
        <div className="tag-cloud" role="list">
          {tags.map((tag) => (
            <Link
              key={tag.slug}
              href={`/tags/${tag.slug}`}
              className="tag-cloud-item"
              style={heatStyle(tag, max)}
              role="listitem"
            >
              {tag.name}
              <span className="tag-cloud-count mono">{tag.count}</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          variant="site"
          copy={{
            title: "还没有标签",
            desc: "登记作品时填写标签，这里会按热度生成标签云。",
          }}
        />
      )}
    </div>
  );
}
