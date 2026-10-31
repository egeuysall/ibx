import type { MetadataRoute } from "next";
import { getIbxSiteUrl } from "@/lib/landing-public-data";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getIbxSiteUrl();
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/docs", "/egeuysall"], disallow: ["/api/", "/app", "/settings", "/files", "/cli-auth", "/landing-drive"] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: new URL(siteUrl).host,
  };
}
