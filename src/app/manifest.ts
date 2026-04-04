import type { MetadataRoute } from "next";

const ICON_VERSION = "20260403";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ibx",
    short_name: "ibx",
    description: "Private thought ibx and todo generator.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#f8f8f8",
    icons: [
      {
        src: `/icon?size=192&v=${ICON_VERSION}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `/icon?size=512&v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `/icon?size=512&v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `/apple-icon?v=${ICON_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
