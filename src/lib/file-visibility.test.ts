import { describe, expect, it } from "bun:test";
import { isPublicFile, resolveFileVisibility } from "./file-visibility";

describe("file visibility", () => {
  it("preserves legacy visibility without publishing explicit private files", () => {
    expect(resolveFileVisibility()).toBe("public");
    expect(resolveFileVisibility("private")).toBe("private");
    expect(resolveFileVisibility("public")).toBe("public");
    expect(isPublicFile({ status: "uploaded" })).toBe(true);
    expect(isPublicFile({ status: "uploaded", visibility: "private" })).toBe(false);
    expect(isPublicFile({ status: "uploaded", visibility: "public", deletedAt: null })).toBe(true);
  });

  it("never publishes deleted or pending files, including legacy rows", () => {
    for (const visibility of [undefined, "public", "private"] as const) {
      expect(isPublicFile({ status: "uploaded", visibility, deletedAt: 0 })).toBe(false);
      expect(isPublicFile({ status: "pendingDelete", visibility })).toBe(false);
      expect(isPublicFile({ status: "deleted", visibility })).toBe(false);
    }
  });
});
