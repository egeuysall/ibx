import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "edge-runtime", include: ["convex/attachments.test.ts", "src/lib/attachment-url.test.ts", "src/lib/file-tree.test.ts"] },
});
