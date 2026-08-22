import type { NextConfig } from "next";

const docsUrl = (process.env.IBX_DOCS_URL || "https://ibx-docs.vercel.app").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      { source: "/docs", destination: `${docsUrl}/docs` },
      { source: "/docs/:path*", destination: `${docsUrl}/docs/:path*` },
    ];
  },
};

export default nextConfig;
