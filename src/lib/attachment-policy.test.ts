import { describe, expect, it } from "bun:test";
import { ATTACHMENT_CONTENT_TYPES, isAllowedAttachmentSize, MAX_ATTACHMENT_BYTES, MAX_LIBRARY_FILE_BYTES } from "./attachment-policy";

describe("attachment policy", () => {
  it("accepts files up to and including 30 MB, never above it", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(30 * 1024 * 1024);
    expect(isAllowedAttachmentSize(MAX_ATTACHMENT_BYTES)).toBe(true);
    for (const size of [0, -1, NaN, Infinity, 1.5, MAX_ATTACHMENT_BYTES + 1]) {
      expect(isAllowedAttachmentSize(size)).toBe(false);
    }
  });

  it("allows library files up to 500 MB while keeping todo attachments capped", () => {
    expect(isAllowedAttachmentSize(MAX_LIBRARY_FILE_BYTES, "file")).toBe(true);
    expect(isAllowedAttachmentSize(MAX_LIBRARY_FILE_BYTES + 1, "file")).toBe(false);
    expect(isAllowedAttachmentSize(MAX_ATTACHMENT_BYTES + 1, "todo")).toBe(false);
  });

  it("accepts MP3 and common video formats but not executable web content", () => {
    for (const type of ["application/pdf", "image/png", "audio/mpeg", "video/mp4", "video/webm", "video/quicktime"]) {
      expect(ATTACHMENT_CONTENT_TYPES).toContain(type);
    }
    for (const type of ["text/html", "image/svg+xml", "application/javascript"]) {
      expect(ATTACHMENT_CONTENT_TYPES).not.toContain(type);
    }
  });
});
