import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { generateTodosFromThought } from "@/lib/ai";
import { getRouteAuth, unauthorizedJson, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { getEgeContext } from "@/lib/ege-context";
import { planGeneratedTodos } from "@/lib/todo-planning";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const API_KEY_LIKE_REGEX = /^iak_[A-Za-z0-9_-]{16,}$/;
const SHORTCUT_QUEUE_MARKER_REGEX = /^\s*IBX_QUEUE\b/im;
const SHORTCUT_CAPTURE_ID_REGEX = /^captureId:\s*([^\n\r]+)\s*$/im;
const SHORTCUT_TEXT_REGEX = /^text:\s*([\s\S]+)$/im;

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

function toShortcutExternalId(captureId: string) {
  const normalized = captureId.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  if (!normalized) {
    return null;
  }

  return `shortcut-${normalized}`;
}

function parseShortcutQueuePayload(input: string) {
  if (!SHORTCUT_QUEUE_MARKER_REGEX.test(input)) {
    return null;
  }

  const captureId = SHORTCUT_CAPTURE_ID_REGEX.exec(input)?.[1]?.trim() ?? null;
  const extractedText = SHORTCUT_TEXT_REGEX.exec(input)?.[1] ?? input;
  const normalizedText = normalizeInputText(extractedText);

  if (!normalizedText) {
    return null;
  }

  return {
    captureId,
    text: normalizedText,
  };
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
  const submittedText = normalizeInputText(body?.text);
  const todayStartUtc = parseTodayStartUtc(body?.today);
  const todayDateKey = toDateKey(todayStartUtc);

  if (!submittedText) {
    return NextResponse.json({ error: "Input is required." }, { status: 400 });
  }

  const parsedShortcutQueue = parseShortcutQueuePayload(submittedText);
  const inputText = parsedShortcutQueue?.text ?? submittedText;
  const shortcutExternalId = parsedShortcutQueue?.captureId
    ? toShortcutExternalId(parsedShortcutQueue.captureId)
    : null;

  if (looksLikeApiKeyPayload(inputText)) {
    return NextResponse.json(
      {
        error:
          "Received an API key in text payload. Your shortcut is using the wrong variable. Reinstall the latest ibx-capture shortcut.",
      },
      { status: 400 },
    );
  }

  const externalId = shortcutExternalId ?? randomUUID();
  if (shortcutExternalId) {
    const existingThought = await convex.query(api.thoughts.getByExternalId, {
      externalId: shortcutExternalId,
    });

    if (existingThought && (existingThought.status === "done" || existingThought.status === "processing")) {
      return NextResponse.json({
        ok: true,
        runId: shortcutExternalId,
        created: 0,
        deduped: true,
      });
    }
  }

  const aiRunId = randomUUID();
  const createdAt = Date.now();

  await convex.mutation(api.thoughts.upsert, {
    externalId,
    rawText: inputText,
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

    const generatedTodos = await generateTodosFromThought(inputText, {
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
      content: `input="${inputText.slice(0, 240)}" created=${plannedTodos.length} todos titles=[${plannedTodos
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
      content: `input="${inputText.slice(0, 240)}" failed="${message.slice(0, 220)}"`,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
