import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_PROFILE_CONTENT_LENGTH = 8_000;
const MAX_RUN_CONTENT_LENGTH = 1_200;

function clampText(text: string, maxLength: number) {
  return text.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export const upsertProfileMemory = mutation({
  args: {
    key: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const content = clampText(args.content, MAX_PROFILE_CONTENT_LENGTH);
    const existing = await ctx.db
      .query("memories")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        kind: "profile",
        content,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("memories", {
      key: args.key,
      kind: "profile",
      content,
      runExternalId: null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addRunMemory = mutation({
  args: {
    runExternalId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const content = clampText(args.content, MAX_RUN_CONTENT_LENGTH);
    return await ctx.db.insert("memories", {
      key: `run:${args.runExternalId}:${now}`,
      kind: "run",
      content,
      runExternalId: args.runExternalId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listRecentRunMemories = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const safeLimit = Math.max(1, Math.min(args.limit, 30));
    return await ctx.db
      .query("memories")
      .withIndex("by_kind_and_updatedAt", (q) => q.eq("kind", "run"))
      .order("desc")
      .take(safeLimit);
  },
});
