import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {
    includeRevoked: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.includeRevoked) {
      return await ctx.db.query("apiKeys").withIndex("by_createdAt").order("desc").take(200);
    }

    return await ctx.db
      .query("apiKeys")
      .withIndex("by_revokedAt_and_createdAt", (q) => q.eq("revokedAt", null))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    keyHash: v.string(),
    prefix: v.string(),
    last4: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("apiKeys", {
      name: args.name,
      keyHash: args.keyHash,
      prefix: args.prefix,
      last4: args.last4,
      createdAt: Date.now(),
      revokedAt: null,
    });
  },
});

export const revoke = mutation({
  args: {
    keyId: v.id("apiKeys"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.keyId);
    if (!existing || existing.revokedAt !== null) {
      return null;
    }

    await ctx.db.patch(args.keyId, { revokedAt: Date.now() });
    return args.keyId;
  },
});

