import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const sourceKindValidator = v.union(v.literal("todo"), v.literal("thought"));
const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

export const getBySource = query({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    sourceKind: sourceKindValidator,
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("publications")
      .withIndex("by_ownerKey_and_sourceKind_and_sourceId", (q) =>
        q
          .eq("ownerKey", args.ownerKey)
          .eq("sourceKind", args.sourceKind)
          .eq("sourceId", args.sourceId),
      )
      .unique();
  },
});

export const upsertBriPublication = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    sourceKind: sourceKindValidator,
    sourceId: v.string(),
    remoteId: v.string(),
    username: v.string(),
    slug: v.string(),
    title: v.string(),
    url: v.string(),
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("publications")
      .withIndex("by_ownerKey_and_sourceKind_and_sourceId", (q) =>
        q
          .eq("ownerKey", args.ownerKey)
          .eq("sourceKind", args.sourceKind)
          .eq("sourceId", args.sourceId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        target: "bri",
        remoteId: args.remoteId,
        username: args.username,
        slug: args.slug,
        title: args.title,
        url: args.url,
        visibility: args.visibility,
        status: "published",
        updatedAt: now,
        lastPublishedAt: now,
        deletedAt: null,
      });
      return existing._id;
    }

    return await ctx.db.insert("publications", {
      ownerKey: args.ownerKey,
      sourceKind: args.sourceKind,
      sourceId: args.sourceId,
      target: "bri",
      remoteId: args.remoteId,
      username: args.username,
      slug: args.slug,
      title: args.title,
      url: args.url,
      visibility: args.visibility,
      status: "published",
      createdAt: now,
      updatedAt: now,
      lastPublishedAt: now,
      deletedAt: null,
    });
  },
});

export const markDeleted = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    sourceKind: sourceKindValidator,
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("publications")
      .withIndex("by_ownerKey_and_sourceKind_and_sourceId", (q) =>
        q
          .eq("ownerKey", args.ownerKey)
          .eq("sourceKind", args.sourceKind)
          .eq("sourceId", args.sourceId),
      )
      .unique();

    if (!existing) {
      return false;
    }

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
    return true;
  },
});
