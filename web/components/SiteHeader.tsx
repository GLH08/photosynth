"use client";

/**
 * SiteHeader（DESIGN 4.2 / 5.4）：sticky 毛玻璃白，高 64px；
 * 左 Logo「光合画廊」+ 钴蓝光圈 SVG；中导航 首页/图片/视频/专辑/标签；
 * 右搜索图标 → /gallery?q=；滚动后加 sh-3；<768px 收汉堡抽屉。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/gallery", label: "图片" },
  { href: "/videos", label: "视频" },
  { href: "/albums", label: "专辑" },
  { href: "/tags", label: "标签" },
] as const;

/** 钴蓝「光圈」SVG 字标（Logo，5.4） */
function ApertureMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M14 2.6 L19.7 12.4 L8.3 12.4 Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M24.4 19.7 L13.1 19.7 L18.8 9.9 Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M3.6 19.7 L9.3 9.9 L15 19.7 Z"
        fill="currentColor"
        opacity="0.3"
      />
      <circle cx="14" cy="14" r="3.1" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // 滚动后加 --sh-3 轻投影（5.4）
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 路由变化收起抽屉
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/gallery?q=${encodeURIComponent(term)}` : "/gallery");
    setSearchOpen(false);
    setDrawerOpen(false);
  };

  const searchForm = (
    <form className={`search-form${searchOpen ? " open" : ""}`} action="/gallery" method="get" onSubmit={onSearch} role="search">
      <input
        ref={searchRef}
        className="search-input"
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索标题 / 提示词…"
        aria-label="搜索作品"
      />
    </form>
  );

  // 管理台独立布局（DESIGN 4.2）：/admin/* 下隐藏公开 Header
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className={`site-header${scrolled ? " scrolled" : ""}`}>
      <div className="header-inner">
        <Link href="/" className="logo" aria-label="光合画廊 Photosynth 首页">
          <ApertureMark />
          <span>光合画廊</span>
          <span className="logo-sub">Photosynth</span>
        </Link>

        <nav className="main-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${isActive(item.href) ? " active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          {searchForm}
          <button
            type="button"
            className="icon-btn search-toggle"
            aria-label="搜索"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13.5 13.5 L17.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn hamburger"
            aria-label={drawerOpen ? "收起菜单" : "展开菜单"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              {drawerOpen ? (
                <path d="M5 5 L17 17 M17 5 L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 6.5 H19 M3 11 H19 M3 15.5 H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {drawerOpen && (
        <div className="drawer">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${isActive(item.href) ? " active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          {searchForm}
        </div>
      )}
    </header>
  );
}
