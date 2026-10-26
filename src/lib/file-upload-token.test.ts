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
    const publicTicket = { ...ticket, visibility: "public" as const };
    expect(verifyUploadTicket(signUploadTicket(publicTicket, secret), "clerk:a", secret)).toEqual(publicTicket);
  });
  test("rejects executable MIME types, empty files and oversized uploads", () => {
    expect(uploadMetadataSchema.safeParse({ ...ticket, size: 500 * 1024 * 1024 }).success).toBe(true);
    expect(uploadMetadataSchema.safeParse({ ...ticket, parentKind: "file", folderId: "abcdefghijklmnopqrst", fileName: "image.svg", contentType: "image/svg+xml" }).success).toBe(true);
    expect(uploadMetadataSchema.safeParse({ ...ticket, directory: "/content/2026/10/25", visibility: "public" }).success).toBe(true);
    expect(uploadMetadataSchema.safeParse({ ...ticket, folderId: "abcdefghijklmnopqrst", directory: "/content" }).success).toBe(false);
    for (const delta of [{ size: 0 }, { size: 500 * 1024 * 1024 + 1 }, { contentType: "text/html" }]) {
      expect(uploadMetadataSchema.safeParse({ ...ticket, ...delta }).success).toBe(false);
    }
    expect(uploadMetadataSchema.safeParse({ ...ticket, parentKind: "todo", size: 30 * 1024 * 1024 + 1 }).success).toBe(false);
  });
});
