import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const docsUrl = (process.env.IBX_DOCS_URL || "https://ibx-docs.vercel.app").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    // The icon used to be a route at /apple-icon. Pages and manifests cached before it became a static file still ask for it.
    return [{ source: "/apple-icon", destination: "/apple-icon.png", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/docs", destination: `${docsUrl}/docs` },
      { source: "/docs/:path*", destination: `${docsUrl}/docs/:path*` },
    ];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
