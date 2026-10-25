// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const auth = { serverToken: "test-storage-secret-at-least-32-characters", ownerKey: "owner-a" };
const upload = {
  ...auth,
  parentKind: "file" as const,
  parentId: "library",
  fileName: "Report.pdf",
  contentType: "application/pdf",
  size: 100,
  r2Key: "objects/report-1",
};

beforeEach(() => {
  vi.stubEnv("IBX_CONVEX_SERVER_SECRET", auth.serverToken);
});
afterEach(() => vi.unstubAllEnvs());

describe("attachment privacy", () => {
  it("fails closed with a bad token or missing configuration", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.attachments.limits, {} as never)).rejects.toThrow();
    await expect(t.mutation(api.attachments.createR2Attachment, {
      ...upload, serverToken: "wrong",
    })).rejects.toThrow("Unauthorized");
    await expect(t.query(api.attachments.listAllAttachments, {
      ...auth, serverToken: "wrong",
    })).rejects.toThrow("Unauthorized");
    expect(await t.query(api.attachments.limits, { serverToken: auth.serverToken })).toHaveProperty("maxBytes");
    vi.stubEnv("IBX_CONVEX_SERVER_SECRET", "");
    await expect(t.query(api.attachments.listPublicFiles, auth)).rejects.toThrow();
    await expect(t.mutation(api.attachments.generateUploadUrl, auth)).rejects.toThrow();
    await expect(t.query(api.attachments.limits, { serverToken: auth.serverToken })).rejects.toThrow();
  });

  it("validates Convex blob metadata and keeps new legacy-API uploads private", async () => {
    const t = convexTest(schema, modules);
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["verified bytes"], { type: "text/plain" })),
    );
    const args = {
      ...auth, parentKind: "file" as const, parentId: "library", storageId,
      fileName: "Legacy.txt", contentType: "text/html", size: 999,
    };
    const result = await t.mutation(api.attachments.createAttachment, args);
    expect(await t.query(api.attachments.getAttachmentDetails, {
      ...auth, attachmentId: result.id,
    })).toMatchObject({ visibility: "private", storageProvider: "convex", size: 14, contentType: "text/plain" });
    expect(await t.query(api.attachments.getAttachmentUrlByOwnerAndFileName, {
      ...auth, fileName: result.fileName,
    })).toBeNull();
    await expect(t.mutation(api.attachments.createAttachment, {
      ...args, ownerKey: "owner-b",
    })).rejects.toThrow("already attached");
  });

  it("defaults standalone uploads private, isolates owners and publishes only by opt-in", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.attachments.createR2Attachment, upload);
    const idArgs = { ...auth, attachmentId: created.id };
    expect(await t.query(api.attachments.getAttachmentDetails, idArgs)).toMatchObject({
      storageProvider: "r2", r2Key: upload.r2Key, visibility: "private",
    });
    expect(await t.query(api.attachments.getAttachmentUrl, idArgs)).toBeNull();
    expect(await t.query(api.attachments.getAttachmentDetails, {
      ...idArgs, ownerKey: "owner-b",
    })).toBeNull();
    expect(await t.mutation(api.attachments.updateVisibility, {
      ...idArgs, ownerKey: "owner-b", visibility: "public",
    })).toBe(false);
    expect(await t.query(api.attachments.getPublicAttachment, {
      ...auth, fileName: created.fileName,
    })).toBeNull();
    expect(await t.query(api.attachments.listPublicFiles, auth)).toEqual({ files: [] });
    expect(await t.mutation(api.attachments.updateVisibility, {
      ...idArgs, visibility: "public",
    })).toBe(true);
    expect(await t.query(api.attachments.getPublicAttachment, {
      ...auth, fileName: created.fileName,
    })).toMatchObject({ _id: created.id });
    const { files } = await t.query(api.attachments.listPublicFiles, auth);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toHaveProperty("ownerKey");
    expect(files[0]).not.toHaveProperty("r2Key");
  });

  it("makes R2 completion idempotent and reserves even deleted filenames and keys", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.attachments.createR2Attachment, upload);
    expect(await t.mutation(api.attachments.createR2Attachment, upload)).toEqual(created);
    await expect(t.mutation(api.attachments.createR2Attachment, {
      ...upload, ownerKey: "owner-b",
    })).rejects.toThrow("already attached");
    const second = await t.mutation(api.attachments.createR2Attachment, {
      ...upload, r2Key: "objects/report-2",
    });
    expect(second.fileName).toBe("report-2.pdf");
    expect(await t.mutation(api.attachments.deleteAttachment, {
      ...auth, attachmentId: created.id,
    })).toBe(true);
    await expect(t.mutation(api.attachments.createR2Attachment, upload)).rejects.toThrow("already attached");
    const third = await t.mutation(api.attachments.createR2Attachment, {
      ...upload, r2Key: "objects/report-3",
    });
    expect(third.fileName).toBe("report-3.pdf");
    expect(await t.mutation(api.attachments.updateVisibility, {
      ...auth, attachmentId: created.id, visibility: "public",
    })).toBe(false);
  });

  it("retains legacy shared files and Convex blobs during migration", async () => {
    const t = convexTest(schema, modules);
    const { id, storageId } = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["legacy"], { type: "text/plain" }));
      const id = await ctx.db.insert("attachments", {
        ownerKey: auth.ownerKey, parentKind: "file", parentId: "library",
        fileName: "legacy.txt", contentType: "text/plain", size: 6,
        storageId, status: "uploaded", createdAt: 1, updatedAt: 1,
      });
      return { id, storageId };
    });
    expect((await t.query(api.attachments.listPublicFiles, auth)).files).toHaveLength(1);
    const idArgs = { ...auth, attachmentId: id };
    await expect(t.mutation(api.attachments.updateVisibility, {
      ...idArgs, visibility: "private",
    })).rejects.toThrow("Migrate attachment");
    expect(await t.query(api.attachments.getAttachmentUrlByOwnerAndFileName, {
      ...auth, fileName: "legacy.txt",
    })).toBeTypeOf("string");
    await t.mutation(api.attachments.markR2Migrated, { ...idArgs, r2Key: "objects/legacy" });
    expect(await t.query(api.attachments.getAttachmentDetails, idArgs)).toMatchObject({
      _id: id, storageId, r2Key: "objects/legacy", storageProvider: "r2", visibility: "public",
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(true);
    const migration = await t.query(api.attachments.listAllForMigration, {
      serverToken: auth.serverToken,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(migration.page[0]._id).toBe(id);
    expect(await t.mutation(api.attachments.updateVisibility, {
      ...idArgs, visibility: "private",
    })).toBe(true);
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) === null)).toBe(true);
    const privateFile = await t.query(api.attachments.getAttachmentDetails, idArgs);
    expect(privateFile?.storageId).toBeUndefined();
    expect(privateFile?.visibility).toBe("private");
    expect((await t.query(api.attachments.listPublicFiles, auth)).files).toHaveLength(0);
  });

  it("paginates explicit public files without exposing private rows or internal fields", async () => {
    const t = convexTest(schema, modules);
    const created: Array<{ id: Id<"attachments">; fileName: string }> = [];
    for (let i = 0; i < 3; i++) {
      created.push(await t.mutation(api.attachments.createR2Attachment, {
        ...upload, r2Key: `objects/public-${i}`, visibility: "public",
      }));
    }
    await t.mutation(api.attachments.createR2Attachment, upload);
    await t.mutation(api.attachments.createR2Attachment, {
      ...upload, ownerKey: "owner-b", r2Key: "objects/other-owner", visibility: "public",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("attachments", {
        ownerKey: auth.ownerKey, parentKind: "file", parentId: "library",
        fileName: "legacy-public.txt", contentType: "text/plain", size: 6,
        status: "uploaded", createdAt: 1, updatedAt: 1,
      });
      await ctx.db.patch(created[0].id, { status: "deleted", deletedAt: Date.now() });
    });
    const args = { ...auth, paginationOpts: { numItems: 1, cursor: null } };
    await expect(t.query(api.attachments.paginatePublicFiles, {
      ...args, serverToken: "wrong",
    })).rejects.toThrow("Unauthorized");
    const first = await t.query(api.attachments.paginatePublicFiles, args);
    const second = await t.query(api.attachments.paginatePublicFiles, {
      ...auth, paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(first.isDone).toBe(false);
    expect(second.isDone).toBe(true);
    expect([first.page[0]._id, second.page[0]._id].sort()).toEqual(
      [created[1].id, created[2].id].sort(),
    );
    for (const row of [...first.page, ...second.page]) {
      expect(Object.keys(row).sort()).toEqual(
        ["_id", "fileName", "contentType", "size", "createdAt", "visibility"].sort(),
      );
      expect(row.visibility).toBe("public");
    }
    await expect(t.query(api.attachments.paginatePublicFiles, {
      ...auth, paginationOpts: { numItems: 101, cursor: null },
    })).rejects.toThrow("Page size");
  });

  it("paginates owner uploads without deleted files and validates uploads", async () => {
    const t = convexTest(schema, modules);
    for (const patch of [{ size: 0 }, { size: 1.5 }, { contentType: "text/html" }, { r2Key: "" }, { parentId: "not-library" }]) {
      await expect(t.mutation(api.attachments.createR2Attachment, { ...upload, ...patch })).rejects.toThrow();
    }
    for (let i = 0; i < 3; i++) {
      await t.mutation(api.attachments.createR2Attachment, { ...upload, r2Key: `objects/${i}` });
    }
    const page1 = await t.query(api.attachments.paginateFiles, {
      ...auth, paginationOpts: { numItems: 2, cursor: null },
    });
    const page2 = await t.query(api.attachments.paginateFiles, {
      ...auth, paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page1.page).toHaveLength(2);
    expect(page1.isDone).toBe(false);
    expect(page2.page).toHaveLength(1);
    expect(page2.isDone).toBe(true);
    expect((await t.query(api.attachments.paginateFiles, {
      ...auth, ownerKey: "owner-b", paginationOpts: { numItems: 2, cursor: null },
    })).page).toHaveLength(0);
  });
});
