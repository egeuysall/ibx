import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 180;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
]);

const parentKindValidator = v.union(v.literal("thought"), v.literal("todo"));

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
  const extension = extensionMatch ? slugify(extensionMatch[1]) : "";
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
  parentKind: "thought" | "todo",
  parentId: string,
) {
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
    attachment.status === "deleted"
  ) {
    return null;
  }

  return attachment;
}

export const limits = query({
  args: {},
  handler: async () => ({
    maxBytes: MAX_ATTACHMENT_BYTES,
    allowedContentTypes: Array.from(ALLOWED_CONTENT_TYPES),
  }),
});

export const generateUploadUrl = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createAttachment = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    parentKind: parentKindValidator,
    parentId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
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
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachment file is too large.");
    }

    if (!isAllowedContentType(contentType)) {
      throw new Error("Attachment file type is not allowed.");
    }

    const now = Date.now();
    const fileName = normalizeFileName(args.fileName);
    const id = await ctx.db.insert("attachments", {
      ownerKey: args.ownerKey,
      parentKind: args.parentKind,
      parentId: args.parentId,
      storageId: args.storageId,
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
    ownerKey: v.union(v.string(), v.null()),
    parentKind: parentKindValidator,
    parentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
    ownerKey: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
  },
  handler: async (ctx, args) => {
    const attachment = await getActiveAttachment(
      ctx,
      args.ownerKey,
      args.attachmentId,
    );
    if (!attachment) {
      return null;
    }

    return await ctx.storage.getUrl(attachment.storageId);
  },
});

export const getAttachmentUrlByOwnerAndFileName = query({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_ownerKey_and_fileName_and_createdAt", (q) =>
        q.eq("ownerKey", args.ownerKey).eq("fileName", args.fileName),
      )
      .order("desc")
      .first();

    if (
      !attachment ||
      !isActive(attachment) ||
      attachment.status !== "uploaded"
    ) {
      return null;
    }

    return await ctx.storage.getUrl(attachment.storageId);
  },
});

export const deleteAttachment = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    attachmentId: v.id("attachments"),
  },
  handler: async (ctx, args) => {
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
    await ctx.storage.delete(attachment.storageId);
    return true;
  },
});
