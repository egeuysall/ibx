import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const MAX_SYNC_OPS = 50;
const MAX_TITLE_LENGTH = 140;
const MAX_NOTES_LENGTH = 4_000;
const USER_TIMEZONE = "America/Chicago";
const USER_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: USER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const todoStatusValidator = v.union(v.literal("open"), v.literal("done"));
const recurrenceValidator = v.union(
  v.literal("none"),
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
);
const priorityValidator = v.union(v.literal(1), v.literal(2), v.literal(3));
const nullableNumberValidator = v.union(v.number(), v.null());
const syncOperationValidator = v.object({
  opId: v.string(),
  clientId: v.string(),
  entityType: v.literal("todo"),
  entityId: v.string(),
  operation: v.union(
    v.literal("create"),
    v.literal("update"),
    v.literal("delete"),
    v.literal("toggle"),
  ),
  baseVersion: v.optional(v.union(v.number(), v.null())),
  createdAt: v.number(),
  payload: v.object({
    title: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
    status: v.optional(todoStatusValidator),
    dueDate: v.optional(nullableNumberValidator),
    estimatedHours: v.optional(nullableNumberValidator),
    timeBlockStart: v.optional(nullableNumberValidator),
    recurrence: v.optional(recurrenceValidator),
    priority: v.optional(priorityValidator),
    source: v.optional(v.union(v.literal("ai"), v.literal("manual"))),
  }),
});

function getUserDateKey(timestamp: number) {
  const parts = USER_DAY_FORMATTER.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    const date = new Date(timestamp);
    const fallbackYear = date.getUTCFullYear();
    const fallbackMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const fallbackDay = String(date.getUTCDate()).padStart(2, "0");
    return `${fallbackYear}-${fallbackMonth}-${fallbackDay}`;
  }

  return `${year}-${month}-${day}`;
}

function getStartOfConfiguredDay(timestamp: number) {
  return Date.parse(`${getUserDateKey(timestamp)}T00:00:00.000Z`);
}

function normalizeEstimatedHours(input: number | null | undefined) {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }

  if (input < 0.25 || input > 24) {
    return null;
  }

  return Math.round(input * 4) / 4;
}

function normalizeTimeBlockStart(input: number | null | undefined) {
  if (input === null) {
    return null;
  }

  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return null;
  }

  return input;
}

function defaultEstimatedHoursForPriority(priority: 1 | 2 | 3) {
  if (priority === 1) {
    return 2;
  }

  if (priority === 2) {
    return 1;
  }

  return 0.5;
}

function normalizeTitle(input: string | undefined) {
  return input?.trim().slice(0, MAX_TITLE_LENGTH) ?? "";
}

function normalizeNotes(input: string | null | undefined) {
  if (input === null) {
    return null;
  }

  if (typeof input !== "string") {
    return null;
  }

  return input.trim().slice(0, MAX_NOTES_LENGTH) || null;
}

async function getOrCreateManualThought(
  ctx: MutationCtx,
  ownerKey: string | null,
  externalId: string,
  title: string,
  now: number,
) {
  const existing =
    ownerKey === null
      ? await ctx.db
          .query("thoughts")
          .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
          .unique()
          .then((thought) =>
            thought?.ownerKey === null || thought?.ownerKey === undefined
              ? thought
              : null,
          )
      : await ctx.db
          .query("thoughts")
          .withIndex("by_ownerKey_and_externalId", (q) =>
            q.eq("ownerKey", ownerKey).eq("externalId", externalId),
          )
          .unique();

  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert("thoughts", {
    ownerKey,
    externalId,
    rawText: title,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
    status: "done",
    synced: true,
    aiRunId: null,
  });
}

export const syncPush = mutation({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    clientId: v.string(),
    ops: v.array(syncOperationValidator),
  },
  handler: async (ctx, args) => {
    if (args.ops.length > MAX_SYNC_OPS) {
      throw new Error(`Too many sync operations. Max ${MAX_SYNC_OPS}.`);
    }

    const accepted = [];
    const rejected = [];
    const conflicts = [];

    for (const op of args.ops) {
      const existingOperation = await ctx.db
        .query("syncOperations")
        .withIndex("by_ownerKey_and_opId", (q) =>
          q.eq("ownerKey", args.ownerKey).eq("opId", op.opId),
        )
        .unique();

      if (existingOperation) {
        accepted.push({
          opId: op.opId,
          entityId: op.entityId,
          serverId: existingOperation.serverId,
          status: existingOperation.status,
          message: existingOperation.message,
        });
        continue;
      }

      const now = Date.now();
      const recordOperation = async (
        status: "accepted" | "rejected" | "conflict",
        serverId: string | null,
        message: string | null,
      ) => {
        await ctx.db.insert("syncOperations", {
          ownerKey: args.ownerKey,
          opId: op.opId,
          clientId: args.clientId,
          entityType: op.entityType,
          entityId: op.entityId,
          operation: op.operation,
          status,
          serverId,
          message,
          createdAt: now,
        });
      };

      if (op.entityType !== "todo") {
        await recordOperation("rejected", null, "Unsupported entity type.");
        rejected.push({ opId: op.opId, entityId: op.entityId, message: "Unsupported entity type." });
        continue;
      }

      if (op.operation === "create") {
        const title = normalizeTitle(op.payload.title);
        if (!title) {
          await recordOperation("rejected", null, "Todo title is required.");
          rejected.push({ opId: op.opId, entityId: op.entityId, message: "Todo title is required." });
          continue;
        }

        const externalId = op.entityId;
        const existingTodo = await ctx.db
          .query("todos")
          .withIndex("by_ownerKey_and_externalId", (q) =>
            q.eq("ownerKey", args.ownerKey).eq("externalId", externalId),
          )
          .unique();

        if (existingTodo) {
          await recordOperation("accepted", String(existingTodo._id), null);
          accepted.push({
            opId: op.opId,
            entityId: op.entityId,
            serverId: String(existingTodo._id),
            status: "accepted",
            message: null,
          });
          continue;
        }

        const priority = op.payload.priority ?? 1;
        const thoughtExternalId = `manual-${externalId}`;
        const thoughtId = await getOrCreateManualThought(
          ctx,
          args.ownerKey,
          thoughtExternalId,
          title,
          now,
        );
        const todoId = await ctx.db.insert("todos", {
          ownerKey: args.ownerKey,
          thoughtId,
          thoughtExternalId,
          externalId,
          title,
          notes: normalizeNotes(op.payload.notes),
          status: op.payload.status ?? "open",
          dueDate: op.payload.dueDate ?? getStartOfConfiguredDay(now),
          estimatedHours:
            normalizeEstimatedHours(op.payload.estimatedHours) ??
            defaultEstimatedHoursForPriority(priority),
          timeBlockStart: normalizeTimeBlockStart(op.payload.timeBlockStart),
          recurrence: op.payload.recurrence ?? "none",
          priority,
          source: op.payload.source ?? "manual",
          createdAt: op.createdAt || now,
          updatedAt: now,
          version: 1,
          deletedAt: null,
        });

        await recordOperation("accepted", String(todoId), null);
        accepted.push({
          opId: op.opId,
          entityId: op.entityId,
          serverId: String(todoId),
          status: "accepted",
          message: null,
        });
        continue;
      }

      const todoId = ctx.db.normalizeId("todos", op.entityId);
      if (!todoId) {
        await recordOperation("rejected", null, "Invalid todo id.");
        rejected.push({ opId: op.opId, entityId: op.entityId, message: "Invalid todo id." });
        continue;
      }

      const existingTodo = await ctx.db.get(todoId);
      if (!existingTodo || (existingTodo.ownerKey ?? null) !== args.ownerKey) {
        await recordOperation("rejected", null, "Todo not found.");
        rejected.push({ opId: op.opId, entityId: op.entityId, message: "Todo not found." });
        continue;
      }

      if (
        typeof op.baseVersion === "number" &&
        typeof existingTodo.version === "number" &&
        existingTodo.version > op.baseVersion
      ) {
        await recordOperation("conflict", String(todoId), "Server version is newer.");
        conflicts.push({
          opId: op.opId,
          entityId: op.entityId,
          serverId: String(todoId),
          message: "Server version is newer.",
          serverVersion: existingTodo.version,
        });
        continue;
      }

      if (op.operation === "delete") {
        await ctx.db.patch(todoId, {
          deletedAt: now,
          updatedAt: now,
          version: (existingTodo.version ?? 1) + 1,
        });
        await recordOperation("accepted", String(todoId), null);
        accepted.push({
          opId: op.opId,
          entityId: op.entityId,
          serverId: String(todoId),
          status: "accepted",
          message: null,
        });
        continue;
      }

      const patch: {
        title?: string;
        notes?: string | null;
        status?: "open" | "done";
        dueDate?: number | null;
        estimatedHours?: number | null;
        timeBlockStart?: number | null;
        recurrence?: "none" | "daily" | "weekly" | "monthly";
        priority?: 1 | 2 | 3;
        updatedAt: number;
        version: number;
      } = {
        updatedAt: now,
        version: (existingTodo.version ?? 1) + 1,
      };

      if (op.operation === "toggle") {
        patch.status = existingTodo.status === "open" ? "done" : "open";
      }

      if (op.payload.title !== undefined) {
        const title = normalizeTitle(op.payload.title);
        if (!title) {
          await recordOperation("rejected", String(todoId), "Todo title is required.");
          rejected.push({
            opId: op.opId,
            entityId: op.entityId,
            message: "Todo title is required.",
          });
          continue;
        }
        patch.title = title;
      }
      if (op.payload.notes !== undefined) patch.notes = normalizeNotes(op.payload.notes);
      if (op.payload.status !== undefined) patch.status = op.payload.status;
      if (op.payload.dueDate !== undefined) patch.dueDate = op.payload.dueDate;
      if (op.payload.estimatedHours !== undefined) {
        patch.estimatedHours = normalizeEstimatedHours(op.payload.estimatedHours);
      }
      if (op.payload.timeBlockStart !== undefined) {
        patch.timeBlockStart = normalizeTimeBlockStart(op.payload.timeBlockStart);
      }
      if (op.payload.recurrence !== undefined) patch.recurrence = op.payload.recurrence;
      if (op.payload.priority !== undefined) patch.priority = op.payload.priority;

      await ctx.db.patch(todoId, patch);
      await recordOperation("accepted", String(todoId), null);
      accepted.push({
        opId: op.opId,
        entityId: op.entityId,
        serverId: String(todoId),
        status: "accepted",
        message: null,
      });
    }

    return {
      accepted,
      rejected,
      conflicts,
      serverNow: Date.now(),
    };
  },
});

export const syncPull = query({
  args: {
    ownerKey: v.union(v.string(), v.null()),
    since: v.union(v.number(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    const since = args.since ?? 0;

    const rows =
      args.ownerKey === null
        ? await ctx.db
            .query("todos")
            .withIndex("by_createdAt")
            .order("desc")
            .take(limit)
            .then((todos) =>
              todos.filter(
                (todo) =>
                  (todo.ownerKey === null || todo.ownerKey === undefined) &&
                  (todo.updatedAt ?? todo.createdAt) > since,
              ),
            )
        : await ctx.db
            .query("todos")
            .withIndex("by_ownerKey_and_updatedAt", (q) =>
              q.eq("ownerKey", args.ownerKey),
            )
            .order("desc")
            .take(limit)
            .then((todos) =>
              todos.filter((todo) => (todo.updatedAt ?? todo.createdAt) > since),
            );

    return {
      todos: rows,
      serverNow: Date.now(),
    };
  },
});
