import { v } from "convex/values";
import { mutation } from "./_generated/server";

const permissionValidator = v.union(
  v.literal("read"),
  v.literal("write"),
  v.literal("both"),
);

export const createCode = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    codeHash: v.string(),
    codeChallenge: v.string(),
    redirectUri: v.string(),
    state: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cliAuthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("cliAuthCodes", {
      ownerKey: args.ownerKey,
      codeHash: args.codeHash,
      codeChallenge: args.codeChallenge,
      redirectUri: args.redirectUri,
      state: args.state,
      createdAt: now,
      expiresAt: args.expiresAt,
      consumedAt: null,
    });
  },
});

export const consumeCodeAndCreateApiKey = mutation({
  args: {
    codeHash: v.string(),
    codeChallenge: v.string(),
    redirectUri: v.string(),
    keyHash: v.string(),
    prefix: v.string(),
    last4: v.string(),
    name: v.string(),
    permission: permissionValidator,
  },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query("cliAuthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    const now = Date.now();

    if (
      !code ||
      code.consumedAt !== null ||
      code.expiresAt < now ||
      code.redirectUri !== args.redirectUri ||
      code.codeChallenge !== args.codeChallenge
    ) {
      return null;
    }

    await ctx.db.patch(code._id, { consumedAt: now });

    const existingKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();

    if (existingKey) {
      return {
        keyId: existingKey._id,
        ownerKey: existingKey.ownerKey ?? null,
      };
    }

    const keyId = await ctx.db.insert("apiKeys", {
      ownerKey: code.ownerKey,
      name: args.name,
      keyHash: args.keyHash,
      prefix: args.prefix,
      last4: args.last4,
      permission: args.permission,
      createdAt: now,
      revokedAt: null,
    });

    return {
      keyId,
      ownerKey: code.ownerKey,
    };
  },
});
