import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const REMINDER_KIND = "timeBlockPrestart";
const SERVER_CHANNEL = "server";
const PRESTART_MS = 5 * 60 * 1000;
const MIN_DELAY_MS = 1_000;
const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_TITLE_LENGTH = 140;
const MAX_EMAIL_ERROR_LENGTH = 240;

type ReminderDelivery = {
  reminderId: Id<"reminders">;
  ownerKey: string | null;
  todoId: string;
  title: string;
  timeBlockStart: number;
} | null;

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

export const prepareReminderDelivery = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args): Promise<ReminderDelivery> => {
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

    return {
      reminderId: args.reminderId,
      ownerKey: reminder.ownerKey ?? null,
      todoId: reminder.todoId,
      title: reminder.title,
      timeBlockStart: reminder.timeBlockStart,
    };
  },
});

export const markReminderDelivered = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.status !== "pending") {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(args.reminderId, {
      status: "sent",
      schedulerId: null,
      deliveredAt: now,
      updatedAt: now,
    });
    return args.reminderId;
  },
});

export const markReminderFailed = internalMutation({
  args: {
    reminderId: v.id("reminders"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.status !== "pending") {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(args.reminderId, {
      status: "failed",
      schedulerId: null,
      lastError: args.message.trim().slice(0, MAX_EMAIL_ERROR_LENGTH),
      updatedAt: now,
    });
    return args.reminderId;
  },
});

function userIdFromOwnerKey(ownerKey: string | null) {
  const prefix = "clerk:";
  if (!ownerKey?.startsWith(prefix)) {
    return null;
  }

  const userId = ownerKey.slice(prefix.length).trim();
  return userId || null;
}

function primaryEmailFromClerkUser(input: unknown) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const user = input as {
    primary_email_address_id?: unknown;
    email_addresses?: unknown;
  };
  const primaryEmailAddressId =
    typeof user.primary_email_address_id === "string"
      ? user.primary_email_address_id
      : null;
  const emailAddresses = Array.isArray(user.email_addresses)
    ? user.email_addresses
    : [];
  const primary = emailAddresses.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return (entry as { id?: unknown }).id === primaryEmailAddressId;
  });
  const fallback = emailAddresses[0];
  const email =
    primary && typeof primary === "object"
      ? (primary as { email_address?: unknown }).email_address
      : fallback && typeof fallback === "object"
        ? (fallback as { email_address?: unknown }).email_address
        : null;

  return typeof email === "string" && email.includes("@") ? email : null;
}

async function getReminderRecipientEmail(ownerKey: string | null) {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
  const userId = userIdFromOwnerKey(ownerKey);
  if (!clerkSecretKey || !userId) {
    return null;
  }

  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Clerk user lookup failed (${response.status}).`);
  }

  return primaryEmailFromClerkUser(await response.json().catch(() => null));
}

function formatReminderTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function sendReminderEmail(delivery: Exclude<ReminderDelivery, null>) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFICATION_EMAIL_FROM?.trim();
  if (!resendApiKey || !from) {
    return "skipped";
  }

  const to = await getReminderRecipientEmail(delivery.ownerKey);
  if (!to) {
    return "skipped";
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `ibx reminder: ${delivery.title}`,
      text: [
        delivery.title,
        "",
        `Starts at ${formatReminderTime(delivery.timeBlockStart)}.`,
        "",
        "Open ibx to continue this task.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend delivery failed (${response.status}).`);
  }

  return "sent";
}

export const sendReminder = internalAction({
  args: {
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    const delivery: ReminderDelivery = await ctx.runMutation(
      internal.reminders.prepareReminderDelivery,
      { reminderId: args.reminderId },
    );
    if (!delivery) {
      return null;
    }

    try {
      await sendReminderEmail(delivery);
      await ctx.runMutation(internal.reminders.markReminderDelivered, {
        reminderId: args.reminderId,
      });
      return args.reminderId;
    } catch (error) {
      await ctx.runMutation(internal.reminders.markReminderFailed, {
        reminderId: args.reminderId,
        message:
          error instanceof Error
            ? error.message
            : "Reminder email delivery failed.",
      });
      return null;
    }
  },
});
