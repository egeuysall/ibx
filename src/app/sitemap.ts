import type { MetadataRoute } from "next";
import { getIbxSiteUrl } from "@/lib/landing-public-data";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getIbxSiteUrl();
  const siteHost = new URL(siteUrl).hostname;
  const files: string[] = [];
  let cursor: string | null = null;
  const timeoutSignal = AbortSignal.timeout(15_000);
  try {
    for (let page = 0; page < 10; page += 1) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`https://ibx.egeuysal.com/api/public/files/egeuysall${query}`, {
        next: { revalidate: 300 },
        signal: timeoutSignal,
      });
      if (!response.ok) break;
      const result = await response.json() as { files?: Array<{ url?: unknown }>; cursor?: unknown; isDone?: unknown };
      for (const file of result.files ?? []) {
        if (typeof file.url !== "string") continue;
        try {
          const url = new URL(file.url);
          if (url.protocol === "https:" && url.hostname === siteHost) files.push(url.toString());
        } catch { /* omit malformed public URLs */ }
      }
      if (result.isDone === true || typeof result.cursor !== "string" || !result.cursor) break;
      cursor = result.cursor;
    }
  } catch { /* keep core site URLs when the public Drive API is unavailable */ }

  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/docs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/egeuysall`, changeFrequency: "weekly", priority: 0.6 },
    ...[...new Set(files)].map((url) => ({ url, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
