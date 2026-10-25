import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileTypeLabel, safeFileUrl, uploadError } from "./file-utils";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachment-policy";

describe("files library", () => {
  it("uses the existing upload size and type policy", () => {
    assert.equal(uploadError({ size: MAX_ATTACHMENT_BYTES, type: "application/pdf" }), null);
    assert.notEqual(uploadError({ size: MAX_ATTACHMENT_BYTES + 1, type: "image/png" }), null);
    assert.notEqual(uploadError({ size: 0, type: "image/png" }), null);
    assert.notEqual(uploadError({ size: 12, type: "text/html" }), null);
  });
  it("labels supported file categories", () => {
    assert.equal(fileTypeLabel("application/pdf"), "pdf");
    assert.equal(fileTypeLabel("video/mp4"), "video");
    assert.equal(fileTypeLabel("text/markdown"), "markdown");
    assert.equal(fileTypeLabel("application/octet-stream"), "file");
  });
  it("never opens executable or malformed URL schemes", () => {
    for (const url of [null, "//evil.example/file", "/\\evil.example/file", "javascript:alert(1)", "data:text/html,test"]) {
      assert.equal(safeFileUrl(url), null);
    }
    assert.equal(safeFileUrl("https://example.com/file"), "https://example.com/file");
    assert.equal(safeFileUrl("/api/attachments/123/file"), "/api/attachments/123/file");
  });
});
