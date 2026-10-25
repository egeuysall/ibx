import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferContentType, MAX_ATTACHMENT_BYTES, uploadAttachmentBytes, validateAttachmentSize, type AttachmentMetadata, type AttachmentUpload } from "./attachment-upload.js";

const metadata: AttachmentMetadata = {
  parentKind: "todo", parentId: "todo-123", fileName: "test.txt", contentType: "text/plain", size: 3,
};
const bytes = new TextEncoder().encode("abc");
const legacy: AttachmentUpload = {
  uploadUrl: "https://storage.example/upload",
  limits: { maxBytes: MAX_ATTACHMENT_BYTES, allowedContentTypes: ["text/plain"] },
};
const signed: AttachmentUpload = {
  ...legacy, method: "PUT", headers: { "Content-Type": "text/plain" }, uploadToken: "ticket",
};

describe("attachment upload", () => {
  it("infers supported MIME types case-insensitively and rejects unknown extensions via the server allowlist", () => {
    for (const [path, type] of [
      ["/tmp/A.PDF", "application/pdf"], ["x.JPG", "image/jpeg"], ["x.mp3", "audio/mpeg"],
      ["x.mov", "video/quicktime"], ["x.md", "text/markdown"], ["x.webm", "video/webm"],
      ["unknown.bin", "application/octet-stream"],
    ]) assert.equal(inferContentType(path), type);
  });

  it("rejects empty or oversized files, including stricter server limits", () => {
    validateAttachmentSize(MAX_ATTACHMENT_BYTES);
    for (const size of [0, -1, NaN, Infinity, 1.5, MAX_ATTACHMENT_BYTES + 1]) {
      assert.throws(() => validateAttachmentSize(size));
    }
    assert.throws(() => validateAttachmentSize(3, 2));
  });

  it("PUTs raw bytes without IBX auth and completes with only the R2 token, accepting an empty response", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, signed.uploadUrl);
      assert.equal(init?.method, "PUT");
      assert.deepEqual(init?.headers, { "Content-Type": "text/plain" });
      assert.equal(await (init?.body as Blob).text(), "abc");
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      assert.deepEqual(await uploadAttachmentBytes(signed, metadata, bytes), { uploadToken: "ticket" });
    } finally { globalThis.fetch = original; }
  });

  it("keeps legacy POST uploads and storageId metadata completion", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, { "Content-Type": "text/plain" });
      assert.equal(await (init?.body as Blob).text(), "abc");
      return Response.json({ storageId: "legacy-id" });
    }) as typeof fetch;
    try {
      assert.deepEqual(await uploadAttachmentBytes(legacy, metadata, bytes), { ...metadata, storageId: "legacy-id" });
    } finally { globalThis.fetch = original; }
  });

  it("rejects invalid sizes, types and partial signed contracts before sending bytes", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("must not upload"); }) as unknown as typeof fetch;
    try {
      await assert.rejects(uploadAttachmentBytes(signed, metadata, new Uint8Array()), /between 1 byte/);
      await assert.rejects(uploadAttachmentBytes(signed, { ...metadata, size: 4 }, bytes), /size changed/);
      await assert.rejects(uploadAttachmentBytes(signed, { ...metadata, contentType: "text/html" }, bytes), /Unsupported/);
      await assert.rejects(uploadAttachmentBytes({ ...signed, uploadToken: undefined }, metadata, bytes), /Invalid signed/);
      await assert.rejects(uploadAttachmentBytes({ ...signed, headers: { "Content-Type": "image/png" } }, metadata, bytes), /Invalid signed/);
    } finally { globalThis.fetch = original; }
  });

  it("does not complete failed uploads or legacy uploads missing a storageId", async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
      await assert.rejects(uploadAttachmentBytes(signed, metadata, bytes), /upload failed \(403\)/);
      globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
      await assert.rejects(uploadAttachmentBytes(legacy, metadata, bytes), /no storage ID/);
    } finally { globalThis.fetch = original; }
  });
});
