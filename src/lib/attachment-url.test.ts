import { describe, expect, it } from "vitest";
import { buildAttachmentViewUrl } from "./attachment-url";

describe("attachment view URLs", () => {
  it("uses the authenticated file route for private attachments", () => {
    expect(buildAttachmentViewUrl("abc123", null)).toBe("/api/attachments/abc123/file");
  });

  it("uses the public URL only when one exists", () => {
    expect(buildAttachmentViewUrl("abc123", "https://ibx.example/ege/folder/file.pdf"))
      .toBe("https://ibx.example/ege/folder/file.pdf");
  });
});
