import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function requireServerSecret(serverSecret: string) {
  const expected = process.env.IBX_CONVEX_SERVER_SECRET?.trim();
  if (!expected || serverSecret !== expected) {
    throw new Error("Forbidden");
  }
}

export const get = query({
  args: {
    serverSecret: v.string(),
    ownerKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    return await ctx.db
      .query("briConnections")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    serverSecret: v.string(),
    ownerKey: v.union(v.string(), v.null()),
    encryptedApiKey: v.string(),
    iv: v.string(),
    authTag: v.string(),
    keyPrefix: v.string(),
    keyLast4: v.string(),
    verifiedAt: v.number(),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const now = Date.now();
    const existing = await ctx.db
      .query("briConnections")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedApiKey: args.encryptedApiKey,
        iv: args.iv,
        authTag: args.authTag,
        keyPrefix: args.keyPrefix,
        keyLast4: args.keyLast4,
        updatedAt: now,
        verifiedAt: args.verifiedAt,
        lastError: null,
      });
      return existing._id;
    }

    return await ctx.db.insert("briConnections", {
      ownerKey: args.ownerKey,
      encryptedApiKey: args.encryptedApiKey,
      iv: args.iv,
      authTag: args.authTag,
      keyPrefix: args.keyPrefix,
      keyLast4: args.keyLast4,
      createdAt: now,
      updatedAt: now,
      verifiedAt: args.verifiedAt,
      lastError: null,
    });
  },
});

export const remove = mutation({
  args: {
    serverSecret: v.string(),
    ownerKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const existing = await ctx.db
      .query("briConnections")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey))
      .unique();

    if (!existing) {
      return false;
    }

    await ctx.db.delete(existing._id);
    return true;
  },
});
