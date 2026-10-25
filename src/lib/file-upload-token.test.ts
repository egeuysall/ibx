import { describe, expect, test } from "bun:test";
import { ownerStoragePrefix, signUploadTicket, verifyUploadTicket, uploadMetadataSchema } from "./file-upload-token";

const secret = "test-only-secret-".repeat(3);
const ticket = {
  ownerKey: "clerk:a", parentKind: "file" as const, parentId: "library",
  fileName: "test.mp3", contentType: "audio/mpeg", size: 123,
  r2Key: `${ownerStoragePrefix("clerk:a")}12345678-1234-1234-1234-123456789abc`,
  expiresAt: Date.now() + 60_000,
};
describe("file upload tickets", () => {
  test("binds metadata, owner and object key to a short-lived signature", () => {
    const token = signUploadTicket(ticket, secret);
    expect(verifyUploadTicket(token, "clerk:a", secret)).toEqual(ticket);
    expect(() => verifyUploadTicket(token, "clerk:b", secret)).toThrow();
    expect(() => verifyUploadTicket(`${token}x`, "clerk:a", secret)).toThrow();
    expect(() => verifyUploadTicket(signUploadTicket({ ...ticket, expiresAt: 0 }, secret), "clerk:a", secret)).toThrow();
    expect(() => verifyUploadTicket(signUploadTicket({ ...ticket, r2Key: `${ownerStoragePrefix("clerk:b")}12345678-1234-1234-1234-123456789abc` }, secret), "clerk:a", secret)).toThrow();
  });
  test("rejects executable MIME types, empty files and oversized uploads", () => {
    expect(uploadMetadataSchema.safeParse({ ...ticket, size: 30 * 1024 * 1024 }).success).toBe(true);
    for (const delta of [{ size: 0 }, { size: 30 * 1024 * 1024 + 1 }, { contentType: "text/html" }]) {
      expect(uploadMetadataSchema.safeParse({ ...ticket, ...delta }).success).toBe(false);
    }
  });
});
