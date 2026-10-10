/**
 * 骨架屏（DESIGN 5.9）：与真实布局同构——瀑布流按预设比例序列出 sunken 圆角块
 * + 卡片文本区两条灰条；shimmer 1.4s 循环；骨架块尺寸即最终尺寸（零跳动）。
 */

/** 预设比例序列：1:1、3:4、16:9、2:3…循环 */
const SKELETON_RATIOS: [number, number][] = [
  [1, 1],
  [3, 4],
  [16, 9],
  [2, 3],
  [4, 3],
  [2, 3],
  [1, 1],
  [16, 9],
  [3, 4],
  [4, 5],
  [16, 9],
  [1, 1],
];

export function MasonrySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="masonry" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const [w, h] = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
        return (
          <div className="masonry-item" key={i}>
            <div className="skeleton-card">
              <div className="skeleton-media" style={{ aspectRatio: `${w} / ${h}` }} />
              <div className="skeleton-body">
                <div className="skeleton-line" style={{ width: "62%" }} />
                <div className="skeleton-line" style={{ width: "88%" }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 无限滚动加载下一页时底部出 4 张小骨架卡（5.9） */
export function MasonrySkeletonSmall({ count = 4 }: { count?: number }) {
  return <MasonrySkeleton count={count} />;
}

/** 视频网格骨架：16:9 大卡（视频比例通常统一，grid 布局，DESIGN 4.3-③） */
export function VideoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="video-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="video-grid-item" key={i}>
          <div className="skeleton-card">
            <div className="skeleton-media" style={{ aspectRatio: "16 / 9" }} />
            <div className="skeleton-body">
              <div className="skeleton-line" style={{ width: "55%" }} />
              <div className="skeleton-line" style={{ width: "85%" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 详情加载骨架：左媒体大块 + 右栏条状（5.9） */
export function DetailSkeleton() {
  return (
    <div className="dialog-skeleton" aria-hidden="true">
      <div className="skeleton-media" style={{ aspectRatio: "16 / 10", borderRadius: 12 }} />
      <div className="skeleton-line" style={{ width: "45%", height: 20 }} />
      <div className="skeleton-line" style={{ width: "90%" }} />
      <div className="skeleton-line" style={{ width: "75%" }} />
      <div className="skeleton-line" style={{ width: "60%" }} />
    </div>
  );
}
