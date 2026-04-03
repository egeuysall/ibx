import { NextRequest, NextResponse } from "next/server";

import { getRouteSession, unauthorizedJson } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

function getStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function GET(request: NextRequest) {
  const session = await getRouteSession(request);
  if (!session) {
    return unauthorizedJson();
  }

  await convex.mutation(api.todos.enforceDueDatesAndReschedule, {
    todayStartUtc: getStartOfUtcDay(Date.now()),
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
