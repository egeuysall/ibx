import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";

const REMINDER_KIND = "timeBlockPrestart";
const SERVER_CHANNEL = "server";
const PRESTART_MS = 5 * 60 * 1000;
const MIN_DELAY_MS = 1_000;
const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_TITLE_LENGTH = 140;

function ownerMatches(row: { ownerKey?: string | null }, ownerKey: string | null) {
  return (row.ownerKey ?? null) === ownerKey;
}

function normalizeTitle(title: string) {
  return title.trim().slice(0, MAX_TITLE_LENGTH) || "ibx task";
}

function isActiveTodo(todo: {
  deletedAt?: number | null;
  status: "open" | "done";
}) {
  return todo.status === "open" && typeof todo.deletedAt !== "number";
}

async function cancelPendingForTodo(
  ctx: MutationCtx,
  ownerKey: string | null,
  todoId: string,
) {
  const pending = await ctx.db
    .query("reminders")
    .withIndex("by_ownerKey_and_todoId_and_kind_and_status", (q) =>
      q
        .eq("ownerKey", ownerKey)
        .eq("todoId", todoId)
        .eq("kind", REMINDER_KIND)
        .eq("status", "pending"),
    )
    .take(20);

  const now = Date.now();
  for (const reminder of pending) {
    if (reminder.schedulerId) {
      await ctx.scheduler.cancel(reminder.schedulerId);
    }
    await ctx.db.patch(reminder._id, {
      status: "cancelled",
      schedulerId: null,
      cancelledAt: now,
      updatedAt: now,
    });
  }
}

async function getOwnedTodo(
  ctx: MutationCtx,
  ownerKey: string | null,
  todoId: string,
) {
  const normalizedTodoId = ctx.db.normalizeId("todos", todoId);
  if (!normalizedTodoId) {
    return null;
  }

  const todo = await ctx.db.get(normalizedTodoId);
  if (!todo || !ownerMatches(todo, ownerKey)) {
    return null;
  }

  return todo;
}

export const listPending = query({
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
        : 50;

    return await ctx.db
      .query("reminders")
      .withIndex("by_ownerKey_and_status_and_scheduledFor", (q) =>
        q.eq("ownerKey", args.ownerKey).eq("status", "pending"),
      )
      .take(limit);
  },
});

export const scheduleTimeBlockReminder = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    todoId: v.string(),
    title: v.string(),
    timeBlockStart: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const todo = await getOwnedTodo(ctx, args.ownerKey, args.todoId);
    if (!todo || !isActiveTodo(todo)) {
      await cancelPendingForTodo(ctx, args.ownerKey, args.todoId);
      return null;
    }

    const now = Date.now();
    const timeBlockStart =
      typeof args.timeBlockStart === "number" &&
      Number.isFinite(args.timeBlockStart)
        ? args.timeBlockStart
        : null;
    if (
      timeBlockStart === null ||
      timeBlockStart <= now ||
      timeBlockStart - now > MAX_SCHEDULE_AHEAD_MS
    ) {
      await cancelPendingForTodo(ctx, args.ownerKey, args.todoId);
      return null;
    }

    const scheduledFor = Math.max(timeBlockStart - PRESTART_MS, now + MIN_DELAY_MS);
    await cancelPendingForTodo(ctx, args.ownerKey, args.todoId);

    const reminderId = await ctx.db.insert("reminders", {
      ownerKey: args.ownerKey,
      todoId: args.todoId,
      kind: REMINDER_KIND,
      channel: SERVER_CHANNEL,
      title: normalizeTitle(args.title),
      scheduledFor,
      timeBlockStart,
      status: "pending",
      schedulerId: null,
      createdAt: now,
      updatedAt: now,
      deliveredAt: null,
      cancelledAt: null,
      lastError: null,
    });
    const schedulerId = await ctx.scheduler.runAt(
      scheduledFor,
      internal.reminders.sendReminder,
      { reminderId },
    );
    await ctx.db.patch(reminderId, {
      schedulerId,
      updatedAt: Date.now(),
    });

    return reminderId;
  },
});

export const cancelTodoReminder = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    todoId: v.string(),
  },
  handler: async (ctx, args) => {
    await cancelPendingForTodo(ctx, args.ownerKey, args.todoId);
    return true;
  },
});

export const sendReminder = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.status !== "pending") {
      return null;
    }

    const todo = await getOwnedTodo(ctx, reminder.ownerKey ?? null, reminder.todoId);
    const now = Date.now();
    if (
      !todo ||
      !isActiveTodo(todo) ||
      todo.timeBlockStart !== reminder.timeBlockStart
    ) {
      await ctx.db.patch(args.reminderId, {
        status: "cancelled",
        schedulerId: null,
        cancelledAt: now,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(args.reminderId, {
      status: "sent",
      schedulerId: null,
      deliveredAt: now,
      updatedAt: now,
    });
    return args.reminderId;
  },
});
