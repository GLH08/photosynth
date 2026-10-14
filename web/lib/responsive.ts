/**
 * 卡片 / 详情 <img> 的响应式 `sizes`（Build-M2）。
 *
 * 数值全部取自 app/globals.css 的真实布局，不猜测：
 *   - 页面容器 max-width 1440px，gutter 24px（≥640px）/ 16px（<640px）（`--container-max` / `--gutter-page`）；
 *   - 瀑布流 .masonry 列数：<640→2 / ≥1024→3 / ≥1280→4 / ≥1536→5，列间距 20px（≥640）/ 12px（<640）（`--masonry-gap`）；
 *   - 视频网格 .video-grid 列数：<640→1 / ≥640→2 / ≥1024→3，间距同上。
 *
 * 宽高比均由 Chevereto 变体承担（.th=320w、.md=500w），故 `sizes` 只需给出容器里该图的 CSS 宽度。
 * 若浏览器不支持 `min()` / `calc()` 形式的 sizes，会回退到默认 100vw，
 * 此时选择最大的候选（原图）——与改造前行为一致，无回归。
 */

/** 瀑布流卡片（/gallery） */
export const CARD_SIZES = [
  "(min-width: 1536px) calc((min(100vw, 1440px) - 48px - 80px) / 5)",
  "(min-width: 1280px) calc((min(100vw, 1440px) - 48px - 60px) / 4)",
  "(min-width: 1024px) calc((min(100vw, 1440px) - 48px - 40px) / 3)",
  "(min-width: 640px) calc((100vw - 48px - 20px) / 2)",
  "calc((100vw - 32px - 12px) / 2)",
].join(", ");

/** 视频网格卡片（/videos、视频专辑） */
export const VIDEO_GRID_SIZES = [
  "(min-width: 1024px) calc((min(100vw, 1440px) - 48px - 40px) / 3)",
  "(min-width: 640px) calc((100vw - 48px - 20px) / 2)",
  "calc(100vw - 32px)",
].join(", ");

/** 详情大图（弹窗左栏 / 独立详情页左媒体区）：桌面约半幅，移动整幅。 */
export const DETAIL_SIZES = "(min-width: 768px) 55vw, 100vw";
