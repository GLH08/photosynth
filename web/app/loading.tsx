/**
 * 路由级加载态（Build-M6）：SSR 首屏取数期间复用画廊骨架（与真实瀑布流同构，零跳动）。
 */
import { MasonrySkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Loading</p>
        <h1 className="page-title">载入中…</h1>
      </header>
      <MasonrySkeleton count={12} />
    </div>
  );
}
