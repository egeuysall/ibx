import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getRouteSession, unauthorizedJson } from "@/lib/auth-server";
import { getEgeContext } from "@/lib/ege-context";
import { generateTodosFromThought } from "@/lib/ai";
import { api, convex } from "@/lib/convex-server";
import { planGeneratedTodos } from "@/lib/todo-planning";

function getExternalId(params: { externalId: string }) {
  const externalId = params.externalId?.trim();
  if (!externalId || externalId.length > 64) {
    return null;
  }

  return externalId;
}

function getStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ externalId: string }> },
) {
  const session = await getRouteSession(request);
  if (!session) {
    return unauthorizedJson();
  }

  const resolvedParams = await params;
  const externalId = getExternalId(resolvedParams);

  if (!externalId) {
    return NextResponse.json({ error: "Invalid thought id." }, { status: 400 });
  }

  const thought = await convex.query(api.thoughts.getByExternalId, { externalId });
  if (!thought) {
    return NextResponse.json({ error: "Thought not found." }, { status: 404 });
  }

  const aiRunId = randomUUID();

  await convex.mutation(api.thoughts.updateStatus, {
    externalId,
    status: "processing",
    aiRunId,
  });

  try {
    const [profileContext, recentRunMemories] = await Promise.all([
      getEgeContext(),
      convex.query(api.memories.listRecentRunMemories, { limit: 8 }),
    ]);

    await convex.mutation(api.memories.upsertProfileMemory, {
      key: "ege:profile:agents-json",
      content: profileContext,
    });

    const generatedTodos = await generateTodosFromThought(thought.rawText, {
      profileContext,
      recentRunMemories: recentRunMemories.map((memory) => memory.content),
    });

    await convex.mutation(api.todos.enforceDueDatesAndReschedule, {
      todayStartUtc: getStartOfUtcDay(Date.now()),
    });
    const existingTodos = await convex.query(api.todos.listAll, {});
    const plannedTodos = planGeneratedTodos(generatedTodos, existingTodos);

    if (plannedTodos.length > 0) {
      await convex.mutation(api.todos.createMany, {
        thoughtId: thought._id,
        thoughtExternalId: externalId,
        items: plannedTodos.map((todo) => ({
          title: todo.title,
          notes: todo.notes,
          dueDate: todo.dueDateTimestamp,
          recurrence: todo.recurrence,
          priority: todo.priority,
          source: "ai" as const,
        })),
      });
    }

    await convex.mutation(api.thoughts.updateStatus, {
      externalId,
      status: "done",
      aiRunId,
      synced: true,
    });

    await convex.mutation(api.memories.addRunMemory, {
      runExternalId: externalId,
      content: `input="${thought.rawText.slice(0, 240)}" created=${plannedTodos.length} todos titles=[${plannedTodos
        .map((todo) => todo.title)
        .slice(0, 6)
        .join(" | ")}]`,
    });

    return NextResponse.json({ ok: true, created: plannedTodos.length });
  } catch (error) {
    await convex.mutation(api.thoughts.updateStatus, {
      externalId,
      status: "failed",
      aiRunId,
      synced: true,
    });

    const message = error instanceof Error ? error.message : "AI generation failed.";

    await convex.mutation(api.memories.addRunMemory, {
      runExternalId: externalId,
      content: `input="${thought.rawText.slice(0, 240)}" failed="${message.slice(0, 220)}"`,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
