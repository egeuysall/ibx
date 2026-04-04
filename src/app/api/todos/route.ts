import { NextRequest, NextResponse } from "next/server";

import { getRouteAuth, unauthorizedJson } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function getStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseTodayStartUtc(today: string | null | undefined) {
  if (today && DATE_KEY_REGEX.test(today)) {
    const parsed = Date.parse(`${today}T00:00:00.000Z`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return getStartOfUtcDay(Date.now());
}

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }

  await convex.mutation(api.todos.enforceDueDatesAndReschedule, {
    todayStartUtc: parseTodayStartUtc(request.nextUrl.searchParams.get("today")),
  });

  const todos = await convex.query(api.todos.listAll, {});

  return NextResponse.json({
    todos: todos.map((todo) => ({
      id: todo._id,
      thoughtId: todo.thoughtExternalId ?? String(todo.thoughtId),
      title: todo.title,
      notes: todo.notes,
      status: todo.status,
      dueDate: todo.dueDate ?? null,
      priority: todo.priority ?? 2,
      recurrence: todo.recurrence ?? "none",
      source: todo.source ?? "manual",
      createdAt: todo.createdAt,
    })),
  });
}
