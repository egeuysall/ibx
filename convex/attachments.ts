import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ATTACHMENT_CONTENT_TYPES, isAllowedAttachmentSize, MAX_ATTACHMENT_BYTES } from "../src/lib/attachment-policy";
import { isPublicFile, resolveFileVisibility } from "../src/lib/file-visibility";
import { requireServerToken } from "./serverAuth";

const MAX_FILE_NAME_LENGTH = 180;
const ALLOWED_CONTENT_TYPES = new Set(ATTACHMENT_CONTENT_TYPES);

const parentKindValidator = v.union(v.literal("thought"), v.literal("todo"), v.literal("file"));
const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

type OwnerScopedRow = {
  ownerKey?: string | null;
  deletedAt?: number | null;
};

function ownerMatches(row: OwnerScopedRow, ownerKey: string | null) {
  return (row.ownerKey ?? null) === ownerKey;
}

function isActive(row: { deletedAt?: number | null }) {
  return typeof row.deletedAt !== "number";
}

function normalizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  const extensionMatch = cleaned.match(/\.([^.]+)$/);
  const extension = extensionMatch ? slugify(extensionMatch[1]).slice(0, 30) : "";
  const base = extensionMatch
    ? cleaned.slice(0, -(extensionMatch[1].length + 1))
    : cleaned;
  const suffix = extension ? `.${extension}` : "";
  const normalizedBase = slugify(base) || "attachment";
  const maxBaseLength = Math.max(1, MAX_FILE_NAME_LENGTH - suffix.length);

  return `${normalizedBase.slice(0, maxBaseLength)}${suffix}`;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isAllowedContentType(contentType: string) {
  return ALLOWED_CONTENT_TYPES.has(contentType);
}

async function findThoughtByParentId(
  ctx: QueryCtx | MutationCtx,
  ownerKey: string | null,
  parentId: string,
) {
  if (ownerKey !== null) {
    return await ctx.db
      .query("thoughts")
      .withIndex("by_ownerKey_and_externalId", (q) =>
        q.eq("ownerKey", ownerKey).eq("externalId", parentId),
      )
      .unique();
  }

  return await ctx.db
    .query("thoughts")
    .withIndex("by_externalId", (q) => q.eq("externalId", parentId))
    .unique()
    .then((thought) =>
      thought && ownerMatches(thought, ownerKey) ? thought : null,
    );
}

async function parentExists(
  ctx: QueryCtx | MutationCtx,
  ownerKey: string | null,
  parentKind: "thought" | "todo" | "file",
  parentId: string,
) {
  if (parentKind === "file") return parentId === "library";
  if (parentKind === "thought") {
    const thought = await findThoughtByParentId(ctx, ownerKey, parentId);
    return Boolean(thought && isActive(thought));
  }

  const todoId = ctx.db.normalizeId("todos", parentId);
  if (!todoId) {
    return false;
  }

  const todo = await ctx.db.get(todoId);
  return Boolean(todo && ownerMatches(todo, ownerKey) && isActive(todo));
}

async function getActiveAttachment(
  ctx: QueryCtx | MutationCtx,
  ownerKey: string | null,
  attachmentId: Id<"attachments">,
) {
  const attachment = await ctx.db.get(attachmentId);
  if (
    !attachment ||
    !ownerMatches(attachment, ownerKey) ||
    !isActive(attachment) ||
    attachment.status !== "uploaded"
  ) {
    return null;
  }

  return attachment;
}

async function reserveFileName(ctx: MutationCtx, ownerKey: string | null, name: string) {
  const baseName = normalizeFileName(name);
  let fileName = baseName;
  // Reserve deleted names too so a shared URL never points at a later upload.
  for (let suffix = 2; ; suffix += 1) {
    const existing = await ctx.db.query("attachments")
      .withIndex("by_ownerKey_and_fileName_and_createdAt", (q) =>
        q.eq("ownerKey", ownerKey).eq("fileName", fileName),
      ).first();
    if (!existing) return fileName;
    if (suffix > 100) throw new Error("Too many files with this name. Rename the file.");
    const dot = baseName.lastIndexOf(".");
    const extension = dot > 0 ? baseName.slice(dot) : "";
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const ending = `-${suffix}${extension}`;
    fileName = `${stem.slice(0, MAX_FILE_NAME_LENGTH - ending.length)}${ending}`;
  }
}

function validateR2Key(r2Key: string) {
  if (!r2Key.trim() || new TextEncoder().encode(r2Key).length > 1024 || /[\u0000-\u001f\u007f]/.test(r2Key)) {
    throw new Error("Invalid R2 object key.");
  }
}

async function findPublicAttachment(ctx: QueryCtx, ownerKey: string | null, fileName: string) {
  const attachment = await ctx.db.query("attachments")
    .withIndex("by_ownerKey_and_fileName_and_createdAt", (q) =>
      q.eq("ownerKey", ownerKey).eq("fileName", fileName),
    ).order("desc").first();
  return attachment && isPublicFile(attachment) ? attachment : null;
}

export const limits = query({
  args: { serverToken: v.string() },
  handler: async (_ctx, args) => {
    requireServerToken(args.serverToken);
    return {
      maxBytes: MAX_ATTACHMENT_BYTES,
      allowedContentTypes: Array.from(ALLOWED_CONTENT_TYPES),
    };
  },
});

export const generateUploadUrl = mutation({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createAttachment = mutation({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    parentKind: parentKindValidator,
    parentId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const parentOk = await parentExists(
      ctx,
      args.ownerKey,
      args.parentKind,
      args.parentId,
    );
    if (!parentOk) {
      throw new Error("Attachment parent not found.");
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error("Uploaded file not found.");
    }

    const contentType = metadata.contentType ?? args.contentType;
    const size = metadata.size;
    if (!isAllowedAttachmentSize(size)) {
      throw new Error("Attachment must be between 1 byte and 30 MB.");
    }

    if (!isAllowedContentType(contentType)) {
      throw new Error("Attachment file type is not allowed.");
    }

    const existingStorage = await ctx.db.query("attachments")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId)).first();
    if (existingStorage) throw new Error("Uploaded file already attached.");

    const now = Date.now();
    const fileName = await reserveFileName(ctx, args.ownerKey, args.fileName);
    const id = await ctx.db.insert("attachments", {
      ownerKey: args.ownerKey,
      parentKind: args.parentKind,
      parentId: args.parentId,
      storageId: args.storageId,
      storageProvider: "convex",
      visibility: args.visibility ?? "private",
      fileName,
      contentType,
      size,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return { id, fileName };
  },
});

export const listAttachments = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    parentKind: parentKindValidator,
    parentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit =
      typeof args.limit === "number" &&
      Number.isFinite(args.limit) &&
      args.limit > 0 &&
      args.limit <= 100
        ? Math.floor(args.limit)
        : 50;

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_ownerKey_and_parentKind_and_parentId_and_createdAt", (q) =>
        q
          .eq("ownerKey", args.ownerKey)
          .eq("parentKind", args.parentKind)
          .eq("parentId", args.parentId),
      )
      .order("desc")
      .take(limit);

    return attachments
      .filter(
        (attachment) =>
          isActive(attachment) &&
          attachment.status === "uploaded",
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listAllAttachments = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit =
      typeof args.limit === "number" &&
      Number.isFinite(args.limit) &&
      args.limit > 0 &&
      args.limit <= 100
        ? Math.floor(args.limit)
        : 100;

    return (await ctx.db
      .query("attachments")
      .withIndex("by_ownerKey_and_createdAt", (q) => q.eq("ownerKey", args.ownerKey))
      .order("desc")
      .take(limit))
      .filter(
        (attachment) =>
          isActive(attachment) && attachment.status === "uploaded",
      );
  },
});

export const getAttachmentUrl = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const attachment = await getActiveAttachment(
      ctx,
      args.ownerKey,
      args.attachmentId,
    );
    if (!attachment) {
      return null;
    }

    return attachment.storageProvider !== "r2" && attachment.storageId
      ? await ctx.storage.getUrl(attachment.storageId) : null;
  },
});

export const getAttachmentDetails = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const attachment = await getActiveAttachment(
      ctx,
      args.ownerKey,
      args.attachmentId,
    );
    if (!attachment) {
      return null;
    }

    return attachment;
  },
});

export const getAttachmentUrlByOwnerAndFileName = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const attachment = await findPublicAttachment(ctx, args.ownerKey, args.fileName);
    return attachment && attachment.storageProvider !== "r2" && attachment.storageId
      ? await ctx.storage.getUrl(attachment.storageId) : null;
  },
});

export const deleteAttachment = mutation({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const attachment = await getActiveAttachment(
      ctx,
      args.ownerKey,
      args.attachmentId,
    );
    if (!attachment) {
      return false;
    }

    await ctx.db.patch(attachment._id, {
      status: "deleted",
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (attachment.storageId) await ctx.storage.delete(attachment.storageId);
    return true;
  },
});

export const createR2Attachment = mutation({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    parentKind: parentKindValidator,
    parentId: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    r2Key: v.string(),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    validateR2Key(args.r2Key);
    if (!isAllowedAttachmentSize(args.size)) {
      throw new Error("Attachment must be between 1 byte and 30 MB.");
    }
    if (!isAllowedContentType(args.contentType)) {
      throw new Error("Attachment file type is not allowed.");
    }
    if (!await parentExists(ctx, args.ownerKey, args.parentKind, args.parentId)) {
      throw new Error("Attachment parent not found.");
    }
    const existing = await ctx.db.query("attachments")
      .withIndex("by_r2Key", (q) => q.eq("r2Key", args.r2Key)).unique();
    if (existing) {
      if (!ownerMatches(existing, args.ownerKey) || !isActive(existing) ||
          existing.status !== "uploaded" || existing.parentKind !== args.parentKind ||
          existing.parentId !== args.parentId || existing.size !== args.size ||
          existing.contentType !== args.contentType) {
        throw new Error("R2 object already attached.");
      }
      // A completion retry never resets visibility or reserves another filename.
      return { id: existing._id, fileName: existing.fileName };
    }
    const fileName = await reserveFileName(ctx, args.ownerKey, args.fileName);
    const now = Date.now();
    const id = await ctx.db.insert("attachments", {
      ownerKey: args.ownerKey,
      parentKind: args.parentKind,
      parentId: args.parentId,
      fileName,
      contentType: args.contentType,
      size: args.size,
      r2Key: args.r2Key,
      storageProvider: "r2",
      visibility: args.visibility ?? "private",
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return { id, fileName };
  },
});

export const paginateFiles = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const result = await ctx.db.query("attachments")
      .withIndex("by_ownerKey_and_status_and_createdAt", (q) =>
        q.eq("ownerKey", args.ownerKey).eq("status", "uploaded"),
      ).order("desc").paginate({
        ...args.paginationOpts,
        numItems: pageSize(args.paginationOpts.numItems),
      });
    return { ...result, page: result.page.filter(isActive) };
  },
});

function pageSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) {
    throw new Error("Page size must be an integer between 1 and 100.");
  }
  return size;
}

export const paginatePublicFiles = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const result = await ctx.db.query("attachments")
      .withIndex("by_ownerKey_and_visibility_and_status_and_createdAt", (q) =>
        q.eq("ownerKey", args.ownerKey).eq("visibility", "public").eq("status", "uploaded"),
      ).order("desc").paginate({
        ...args.paginationOpts,
        numItems: pageSize(args.paginationOpts.numItems),
      });
    return {
      ...result,
      page: result.page.filter(isPublicFile).map((file) => ({
        _id: file._id,
        fileName: file.fileName,
        contentType: file.contentType,
        size: file.size,
        createdAt: file.createdAt,
        visibility: "public" as const,
      })),
    };
  },
});

export const listPublicFiles = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const limit = Math.min(pageSize(args.limit ?? 50), 50);
    const batches = await Promise.all((["public", undefined] as const).map((visibility) =>
      ctx.db.query("attachments")
        .withIndex("by_ownerKey_and_visibility_and_status_and_createdAt", (q) =>
          q.eq("ownerKey", args.ownerKey).eq("visibility", visibility).eq("status", "uploaded"),
        ).order("desc").take(limit),
    ));
    const files = batches.flat().filter(isPublicFile)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((file) => ({
        _id: file._id,
        fileName: file.fileName,
        contentType: file.contentType,
        size: file.size,
        createdAt: file.createdAt,
        visibility: "public" as const,
      }));
    return { files };
  },
});

export const getPublicAttachment = query({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    return await findPublicAttachment(ctx, args.ownerKey, args.fileName);
  },
});

export const updateVisibility = mutation({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    const attachment = await getActiveAttachment(ctx, args.ownerKey, args.attachmentId);
    if (!attachment) return false;
    if (args.visibility === "private") {
      if (!attachment.r2Key) throw new Error("Migrate attachment to R2 before making it private.");
      if (attachment.storageId) await ctx.storage.delete(attachment.storageId);
      await ctx.db.patch(attachment._id, { visibility: "private", storageId: undefined });
    } else {
      await ctx.db.patch(attachment._id, { visibility: "public" });
    }
    return true;
  },
});

export const markR2Migrated = mutation({
  args: {
    serverToken: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
    r2Key: v.string(),
  },
  handler: async (ctx, args) => {
    requireServerToken(args.serverToken);
    validateR2Key(args.r2Key);
    const attachment = await getActiveAttachment(ctx, args.ownerKey, args.attachmentId);
    if (!attachment || !attachment.storageId) throw new Error("Legacy attachment not found.");
    const existing = await ctx.db.query("attachments")
      .withIndex("by_r2Key", (q) => q.eq("r2Key", args.r2Key)).unique();
    if ((existing && existing._id !== attachment._id) ||
        (attachment.r2Key && attachment.r2Key !== args.r2Key)) {
      throw new Error("R2 object already attached.");
    }
    await ctx.db.patch(attachment._id, {
      r2Key: args.r2Key,
      storageProvider: "r2",
      visibility: resolveFileVisibility(attachment.visibility),
    });
    return true;
  },
});

export const listAllForMigration = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db.query("attachments").paginate({
      ...args.paginationOpts,
      numItems: pageSize(args.paginationOpts.numItems),
    });
  },
});
