import type { MetadataRoute } from "next";
import { getIbxSiteUrl } from "@/lib/landing-public-data";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getIbxSiteUrl();
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/docs", "/egeuysall"], disallow: ["/api/", "/app", "/settings", "/sign-in", "/sign-up", "/landing-drive"] },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
