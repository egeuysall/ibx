import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LENGTH = 140;
const MAX_NOTES_LENGTH = 640;
const MANUAL_TODO_DEFAULT_PRIORITY = 1;

function parseTodayStartUtc(today: string | null | undefined) {
  if (today && DATE_KEY_REGEX.test(today)) {
    const parsed = Date.parse(`${today}T00:00:00.000Z`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
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
  const ownerKey = getRouteAuthOwnerKey(auth);

  const todayStartUtc = parseTodayStartUtc(request.nextUrl.searchParams.get("today"));
  if (todayStartUtc !== null) {
    await convex.mutation(api.todos.enforceDueDatesAndReschedule, {
      ownerKey,
      todayStartUtc,
    });
  }

  const todos = await convex.query(api.todos.listAll, { ownerKey });

  return NextResponse.json({
    todos: todos.map((todo) => ({
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
    })),
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
  const ownerKey = getRouteAuthOwnerKey(auth);

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    notes?: unknown;
    dueDate?: unknown;
    estimatedHours?: unknown;
    timeBlockStart?: unknown;
    recurrence?: unknown;
    priority?: unknown;
  } | null;

  const title =
    typeof body?.title === "string"
      ? body.title.trim().slice(0, MAX_TITLE_LENGTH)
      : "";
  const notes =
    typeof body?.notes === "string"
      ? body.notes.trim().slice(0, MAX_NOTES_LENGTH) || null
      : null;
  const dueDateInput =
    typeof body?.dueDate === "string" ? body.dueDate.trim() : null;
  const estimatedHoursInput = body?.estimatedHours;
  const timeBlockStartInput = body?.timeBlockStart;
  const recurrenceInput =
    typeof body?.recurrence === "string" ? body.recurrence : "none";
  const priorityInput = body?.priority;

  if (!title) {
    return NextResponse.json({ error: "Todo title is required." }, { status: 400 });
  }

  if (body?.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
    return NextResponse.json({ error: "Invalid notes value." }, { status: 400 });
  }

  const dueDate =
    dueDateInput && DATE_KEY_REGEX.test(dueDateInput)
      ? Date.parse(`${dueDateInput}T00:00:00.000Z`)
      : null;
  if (dueDateInput && dueDate === null) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  const estimatedHours =
    typeof estimatedHoursInput === "number" &&
    Number.isFinite(estimatedHoursInput) &&
    estimatedHoursInput >= 0.25 &&
    estimatedHoursInput <= 24
      ? Math.round(estimatedHoursInput * 4) / 4
      : null;
  if (
    estimatedHoursInput !== undefined &&
    estimatedHoursInput !== null &&
    estimatedHours === null
  ) {
    return NextResponse.json({ error: "Invalid estimated hours." }, { status: 400 });
  }

  const timeBlockStart =
    typeof timeBlockStartInput === "number" &&
    Number.isFinite(timeBlockStartInput) &&
    timeBlockStartInput > 0
      ? timeBlockStartInput
      : null;
  if (
    timeBlockStartInput !== undefined &&
    timeBlockStartInput !== null &&
    timeBlockStart === null
  ) {
    return NextResponse.json({ error: "Invalid time block start." }, { status: 400 });
  }

  const recurrence =
    recurrenceInput === "daily" ||
    recurrenceInput === "weekly" ||
    recurrenceInput === "monthly" ||
    recurrenceInput === "none"
      ? recurrenceInput
      : null;
  if (recurrence === null) {
    return NextResponse.json({ error: "Invalid recurrence value." }, { status: 400 });
  }

  let priority: 1 | 2 | 3 = MANUAL_TODO_DEFAULT_PRIORITY;
  if (priorityInput === 1 || priorityInput === 2 || priorityInput === 3) {
    priority = priorityInput;
  } else if (priorityInput !== undefined && priorityInput !== null) {
    return NextResponse.json({ error: "Invalid priority value." }, { status: 400 });
  }

  const externalId = `manual-${randomUUID()}`;
  const createdAt = Date.now();
  const thoughtId = await convex.mutation(api.thoughts.upsert, {
    ownerKey,
    externalId,
    rawText: title,
    createdAt,
    status: "done",
    synced: true,
    aiRunId: null,
  });
  const todoId = await convex.mutation(api.todos.createOne, {
    ownerKey,
    thoughtId,
    thoughtExternalId: externalId,
    title,
    notes,
    dueDate,
    estimatedHours,
    timeBlockStart,
    recurrence,
    priority,
    source: "manual",
  });

  return NextResponse.json({ ok: true, id: todoId, thoughtId: externalId });
}
