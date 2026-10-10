/**
 * EmptyState（DESIGN 5.9，A 的成套经验视觉翻新）：居中卡片——72px 线性插画图标
 * （钴蓝 20% 透明度衬圆底）+ 标题 + 说明 + 可选 CTA。
 * 四种文案变体：全站空 / 筛选无结果 / 专辑空 / 搜索无结果。
 */
import type { ReactNode } from "react";

export type EmptyVariant = "site" | "filter" | "album" | "search";

const COPY: Record<EmptyVariant, { title: string; desc: string }> = {
  site: {
    title: "这里还没有作品",
    desc: "用右上角「＋新建」登记第一幅作品，或在 .env 打开 SEED_DEMO 后重启。",
  },
  filter: {
    title: "没有符合筛选的作品",
    desc: "试试调整比例、专辑或标签条件，也可以一键清除全部筛选浏览所有作品。",
  },
  album: {
    title: "专辑还是空的",
    desc: "该专辑下暂无公开作品，登记作品并归入此专辑后会出现在这里。",
  },
  search: {
    title: "没有匹配的搜索结果",
    desc: "换个关键词试试，或清除搜索浏览全部作品。",
  },
};

interface Props {
  variant: EmptyVariant;
  /** search 变体时展示搜索词 */
  query?: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: ReactNode;
  /** 自定义文案（专辑/标签页等空态场景），覆盖变体默认文案 */
  copy?: { title: string; desc: string };
}

function DefaultIcon() {
  // 72px 圆底内的线性插画（相框 + 山形，钴蓝）
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="4" y="7" width="26" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 23 14 16l4.5 5L22 18l4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="12.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

export default function EmptyState({ variant, query, ctaLabel, onCta, icon, copy: custom }: Props) {
  const copy = custom ?? COPY[variant];
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon ?? <DefaultIcon />}</span>
      <h2 className="empty-title">{copy.title}</h2>
      <p className="empty-desc">
        {variant === "search" && query && !custom ? `「${query}」${copy.desc}` : copy.desc}
      </p>
      {ctaLabel && onCta && (
        <button type="button" className="btn btn-primary" onClick={onCta}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
