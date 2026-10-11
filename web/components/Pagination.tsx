"use client";

/**
 * Pagination（Build-F【1】分页模式页码条）：
 * 1/2/3 + 首尾页 + 省略号窗口（当前页前后各 1 页，首尾恒可见）；
 * 上一页/下一页按钮；页码经 onChange 上报（URL query 同步由页面层负责）。
 */
interface Props {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  /** 底部右侧补充信息，如「共 1183 幅」 */
  info?: string;
}

/** 生成页码窗口：1 … (p-1) p (p+1) … N，去重且保序 */
export function pageWindow(page: number, pages: number, span = 1): (number | "gap")[] {
  if (pages <= 0) return [];
  const wanted = new Set<number>([1, pages]);
  for (let i = page - span; i <= page + span; i++) {
    if (i >= 1 && i <= pages) wanted.add(i);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

export default function Pagination({ page, pages, onChange, info }: Props) {
  if (pages <= 1) return null;
  const go = (p: number) => {
    const target = Math.min(Math.max(1, p), pages);
    if (target !== page) onChange(target);
  };

  return (
    <nav className="pagination" aria-label="分页导航">
      <button
        type="button"
        className="page-btn"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        aria-label="上一页"
      >
        ‹
      </button>

      {pageWindow(page, pages).map((item, i) =>
        item === "gap" ? (
          <span className="page-gap" key={`gap-${i}`} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            type="button"
            className="page-btn"
            key={item}
            aria-current={item === page ? "page" : undefined}
            aria-label={`第 ${item} 页`}
            onClick={() => go(item)}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className="page-btn"
        disabled={page >= pages}
        onClick={() => go(page + 1)}
        aria-label="下一页"
      >
        ›
      </button>

      {info && <span className="page-info">{info}</span>}
    </nav>
  );
}
