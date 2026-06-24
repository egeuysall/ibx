import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

const MAX_SYNC_OPS = 50;
const MAX_RICH_TEXT_LENGTH = 200_000;

type NormalizedSyncOperation = {
  opId: string;
  clientId: string;
  entityType: "todo";
  entityId: string;
  operation: "create" | "update" | "delete" | "toggle";
  baseVersion?: number | null;
  createdAt: number;
  payload: {
    title?: string;
    notes?: string | null;
    notesJson?: string | null;
    notesHtml?: string | null;
    status?: "open" | "done";
    dueDate?: number | null;
    estimatedHours?: number | null;
    timeBlockStart?: number | null;
    recurrence?: "none" | "daily" | "weekly" | "monthly";
    priority?: 1 | 2 | 3;
    source?: "ai" | "manual";
  };
};

function normalizeRichTextJson(input: unknown) {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }

  const serialized =
    typeof input === "string" ? input : JSON.stringify(input);
  if (serialized.length > MAX_RICH_TEXT_LENGTH) {
    return undefined;
  }

  return serialized;
}

function normalizeRichTextHtml(input: unknown) {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (typeof input !== "string") {
    return undefined;
  }

  const trimmed = input.trim();
  if (trimmed.length > MAX_RICH_TEXT_LENGTH) {
    return undefined;
  }

  return trimmed || null;
}

function normalizeSyncOperation(input: unknown): NormalizedSyncOperation | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const value = input as Record<string, unknown>;
  const opId = typeof value.opId === "string" ? value.opId.trim() : "";
  const clientId = typeof value.clientId === "string" ? value.clientId.trim() : "";
  const entityType = value.entityType;
  const entityId = typeof value.entityId === "string" ? value.entityId.trim() : "";
  const operation = value.operation;
  const payload =
    value.payload && typeof value.payload === "object"
      ? (value.payload as Record<string, unknown>)
      : {};
  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();
  const baseVersion =
    typeof value.baseVersion === "number" && Number.isFinite(value.baseVersion)
      ? value.baseVersion
      : value.baseVersion === null
        ? null
        : undefined;

  if (!opId || opId.length > 128 || !clientId || clientId.length > 128) {
    return null;
  }
  if (entityType !== "todo") {
    return null;
  }
  if (!entityId || entityId.length > 128) {
    return null;
  }
  if (
    operation !== "create" &&
    operation !== "update" &&
    operation !== "delete" &&
    operation !== "toggle"
  ) {
    return null;
  }
  const normalizedOperation = operation;

  return {
    opId,
    clientId,
    entityType: "todo",
    entityId,
    operation: normalizedOperation,
    baseVersion,
    createdAt,
    payload: {
      title: typeof payload.title === "string" ? payload.title : undefined,
      notes:
        typeof payload.notes === "string" || payload.notes === null
          ? payload.notes
          : undefined,
      notesJson: normalizeRichTextJson(payload.notesJson),
      notesHtml: normalizeRichTextHtml(payload.notesHtml),
      status:
        payload.status === "open" || payload.status === "done"
          ? payload.status
          : undefined,
      dueDate:
        typeof payload.dueDate === "number" || payload.dueDate === null
          ? payload.dueDate
          : undefined,
      estimatedHours:
        typeof payload.estimatedHours === "number" ||
        payload.estimatedHours === null
          ? payload.estimatedHours
          : undefined,
      timeBlockStart:
        typeof payload.timeBlockStart === "number" ||
        payload.timeBlockStart === null
          ? payload.timeBlockStart
          : undefined,
      recurrence:
        payload.recurrence === "none" ||
        payload.recurrence === "daily" ||
        payload.recurrence === "weekly" ||
        payload.recurrence === "monthly"
          ? payload.recurrence
          : undefined,
      priority:
        payload.priority === 1 || payload.priority === 2 || payload.priority === 3
          ? payload.priority
          : undefined,
      source:
        payload.source === "ai" || payload.source === "manual"
          ? payload.source
          : undefined,
    },
  };
}

function mapTodo(todo: {
  _id: string;
  thoughtExternalId?: string;
  thoughtId: string;
  title: string;
  notes: string | null;
  notesJson?: string | null;
  notesHtml?: string | null;
  status: "open" | "done";
  dueDate?: number | null;
  estimatedHours?: number | null;
  timeBlockStart?: number | null;
  priority?: 1 | 2 | 3;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  source?: "ai" | "manual";
  createdAt: number;
  updatedAt?: number;
  version?: number;
  deletedAt?: number | null;
}) {
  return {
    id: todo._id,
    thoughtId: todo.thoughtExternalId ?? String(todo.thoughtId),
    title: todo.title,
    notes: todo.notes,
    notesJson: todo.notesJson ?? null,
    notesHtml: todo.notesHtml ?? null,
    status: todo.status,
    dueDate: todo.dueDate ?? null,
    estimatedHours:
      typeof todo.estimatedHours === "number" ? todo.estimatedHours : null,
    timeBlockStart:
      typeof todo.timeBlockStart === "number" ? todo.timeBlockStart : null,
    priority: todo.priority ?? 2,
    recurrence: todo.recurrence ?? "none",
    source: todo.source ?? "manual",
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt ?? todo.createdAt,
    version: todo.version ?? 1,
    deletedAt: todo.deletedAt ?? null,
  };
}

async function syncReminderForAcceptedTodo(
  ownerKey: string | null,
  todoId: string,
) {
  const todo = await convex.query(api.todos.getByStringId, {
    ownerKey,
    todoId,
  });
  if (!todo || todo.status !== "open") {
    await convex.mutation(api.reminders.cancelTodoReminder, {
      ownerKey,
      todoId,
    });
    return;
  }

  await convex.mutation(api.reminders.scheduleTimeBlockReminder, {
    ownerKey,
    todoId,
    title: todo.title,
    timeBlockStart:
      typeof todo.timeBlockStart === "number" ? todo.timeBlockStart : null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, auth);
  if (csrfError) {
    return csrfError;
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const body = (await request.json().catch(() => null)) as {
    clientId?: unknown;
    ops?: unknown;
  } | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const rawOps = Array.isArray(body?.ops) ? body.ops : null;

  if (!clientId || clientId.length > 128 || !rawOps) {
    return NextResponse.json({ error: "Invalid sync payload." }, { status: 400 });
  }
  if (rawOps.length > MAX_SYNC_OPS) {
    return NextResponse.json(
      { error: `Too many sync operations. Max ${MAX_SYNC_OPS}.` },
      { status: 400 },
    );
  }

  const ops = rawOps.map(normalizeSyncOperation);
  if (ops.some((operation) => operation === null)) {
    return NextResponse.json({ error: "Invalid sync operation." }, { status: 400 });
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const result = await convex.mutation(api.sync.syncPush, {
    ownerKey,
    clientId,
    ops: ops as NormalizedSyncOperation[],
  });
  const operationById = new Map(
    (ops as NormalizedSyncOperation[]).map((operation) => [
      operation.opId,
      operation,
    ]),
  );
  for (const acceptedOperation of result.accepted) {
    if (acceptedOperation.status !== "accepted" || !acceptedOperation.serverId) {
      continue;
    }

    const operation = operationById.get(acceptedOperation.opId);
    if (operation?.operation === "delete") {
      await convex.mutation(api.reminders.cancelTodoReminder, {
        ownerKey,
        todoId: acceptedOperation.serverId,
      });
      continue;
    }

    await syncReminderForAcceptedTodo(ownerKey, acceptedOperation.serverId);
  }

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const sinceParam = request.nextUrl.searchParams.get("since");
  const since =
    sinceParam && Number.isFinite(Number(sinceParam)) ? Number(sinceParam) : null;
  const ownerKey = getRouteAuthOwnerKey(auth);
  const result = await convex.query(api.sync.syncPull, {
    ownerKey,
    since,
    limit: 100,
  });

  return NextResponse.json({
    todos: result.todos.map(mapTodo),
    serverNow: result.serverNow,
  });
}
