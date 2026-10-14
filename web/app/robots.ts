/**
 * robots.txt（Build-M6）：私有、需登录才能访问的站点，对全部爬虫禁入。
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
