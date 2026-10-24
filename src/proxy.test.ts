import { describe, expect, it } from "bun:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "./proxy";

describe("attachment cookie authentication", () => {
  for (const extension of ["png", "jpg", "jpeg", "gif", "webp", "pdf", "md", "txt", "mp3", "m4a", "wav", "ogg", "mp4", "m4v", "mov", "webm", "ogv"]) {
    it(`runs Clerk middleware for ${extension} attachment URLs`, () => {
      expect(unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: `/egeuysall/thumbnail-split.${extension}`,
      })).toBe(true);
    });
  }

  it("still skips Next.js static assets", () => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/_next/static/chunks/app.js",
    })).toBe(false);
  });
});
