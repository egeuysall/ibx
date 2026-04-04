import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { generateTodosFromThought } from "@/lib/ai";
import { getRouteAuth, unauthorizedJson, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { getEgeContext } from "@/lib/ege-context";
import { planGeneratedTodos } from "@/lib/todo-planning";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const API_KEY_LIKE_REGEX = /^iak_[A-Za-z0-9_-]{16,}$/;

function normalizeInputText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().slice(0, 8_000);
  return normalized.length ? normalized : null;
}

function looksLikeApiKeyPayload(text: string) {
  return API_KEY_LIKE_REGEX.test(text.trim());
}

function getStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toDateKey(utcStart: number) {
  return new Date(utcStart).toISOString().slice(0, 10);
}

function parseTodayStartUtc(today: unknown) {
  if (typeof today === "string") {
    const normalized = today.trim();
    if (DATE_KEY_REGEX.test(normalized)) {
      const parsed = Date.parse(`${normalized}T00:00:00.000Z`);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return getStartOfUtcDay(Date.now());
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

  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; today?: unknown }
    | null;
  const rawText = normalizeInputText(body?.text);
  const todayStartUtc = parseTodayStartUtc(body?.today);
  const todayDateKey = toDateKey(todayStartUtc);

  if (!rawText) {
    return NextResponse.json({ error: "Input is required." }, { status: 400 });
  }

  if (looksLikeApiKeyPayload(rawText)) {
    return NextResponse.json(
      {
        error:
          "Received an API key in text payload. Your sync shortcut is using the wrong variable. Reinstall the latest ibx-sync-queue shortcut.",
      },
      { status: 400 },
    );
  }

  const externalId = randomUUID();
  const aiRunId = randomUUID();
  const createdAt = Date.now();

  await convex.mutation(api.thoughts.upsert, {
    externalId,
    rawText,
    createdAt,
    status: "processing",
    synced: true,
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

    const generatedTodos = await generateTodosFromThought(rawText, {
      profileContext,
      recentRunMemories: recentRunMemories.map((memory) => memory.content),
      todayDateKey,
    });

    const thought = await convex.query(api.thoughts.getByExternalId, { externalId });
    if (!thought) {
      return NextResponse.json({ error: "Thought was not created." }, { status: 500 });
    }

    await convex.mutation(api.todos.enforceDueDatesAndReschedule, {
      todayStartUtc,
    });
    const existingTodos = await convex.query(api.todos.listAll, {});
    const plannedTodos = planGeneratedTodos(generatedTodos, existingTodos, todayStartUtc);

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
      content: `input="${rawText.slice(0, 240)}" created=${plannedTodos.length} todos titles=[${plannedTodos
        .map((todo) => todo.title)
        .slice(0, 6)
        .join(" | ")}]`,
    });

    return NextResponse.json({
      ok: true,
      runId: externalId,
      created: plannedTodos.length,
    });
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
      content: `input="${rawText.slice(0, 240)}" failed="${message.slice(0, 220)}"`,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
