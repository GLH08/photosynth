"use client";

/**
 * 路由级错误边界（Build-M6）：子树渲染抛错时兜底，提供「重试」。
 * reset() 会尝试重新渲染该路由段（不发整页刷新）。
 */
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <p className="notfound-code mono" aria-hidden="true">
          !
        </p>
        <p className="eyebrow">Error</p>
        <h1 className="notfound-title">这一页加载失败了</h1>
        <p className="notfound-desc">渲染这一页时发生错误。可以点「重试」，或回到首页。</p>
        <div className="notfound-actions">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            重试
          </button>
          <a href="/" className="btn btn-secondary">
            回到首页
          </a>
        </div>
      </div>
    </div>
  );
}
