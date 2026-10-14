import { NextRequest, NextResponse } from "next/server";

/**
 * 全站登录保护（整站仅本人可访问）：
 * - 放行：/admin/login、/api/admin/login、/api/admin/logout、/api/health（Docker 健康检查）；
 * - 其余（页面与 /api/* 代理一律）转发浏览器 Cookie 直连后端
 *   GET /api/admin/works?limit=1 校验；
 * - 校验 401/403：页面 → 307 跳 /admin/login?next=<原路径>；/api/* → 401 JSON
 *   （与后端未登录语义同构，客户端现有 401 处理继续工作）；
 * - 后端不可达：放行，由页面错误态 / 代理 502 兜底。
 * ADMIN_TOKEN 永不进 web 容器；Cookie 校验走后端。
 */
function backendOrigin(): string {
  return (process.env.BACKEND_ORIGIN ?? "http://api:8000").replace(/\/$/, "");
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/logout" ||
    pathname === "/api/health"
  );
}

function deny(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "请先登录" } },
      { status: 401 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url, 307);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const cookie = req.headers.get("cookie");
  if (!cookie) return deny(req); // 无 Cookie 免一次后端往返

  try {
    const r = await fetch(`${backendOrigin()}/api/admin/works?limit=1`, {
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
    });
    if (r.status === 401 || r.status === 403) return deny(req);
  } catch {
    return NextResponse.next(); // 后端不可达：放行兜底
  }
  return NextResponse.next();
}

export const config = {
  // _next 静态资源与站点品牌/SEO 资产（favicon.ico / icon.png / robots.txt）不进 middleware
  // （其余全量校验）
  matcher: ["/((?!_next|favicon.ico|icon.png|robots.txt).*)"],
};
