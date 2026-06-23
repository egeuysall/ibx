import { getStringOption, hasFlag } from "../core/args.js";
import { requireConfig } from "../core/config.js";
import { EXIT_CODE } from "../core/constants.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { logEvent, print, printJson, printOk } from "../core/output.js";
import type { ParsedArgs, TodoItem } from "../core/types.js";
import { resolveTodoId } from "./todos.js";

type PublicationRecord = {
  id: string;
  url: string;
  title: string;
  visibility: "public" | "private";
  status: "published" | "deleted";
};

function normalizePublishSubcommand(value: string | null) {
  if (!value) {
    return "publish";
  }

  if (value === "publish" || value === "up" || value === "p") {
    return "publish";
  }

  if (value === "unpublish" || value === "delete" || value === "down" || value === "u") {
    return "unpublish";
  }

  return "publish";
}

export async function runPublishCommand(parsed: ParsedArgs) {
  const outputJson = hasFlag(parsed, "json");
  const config = await requireConfig();
  const subcommand = normalizePublishSubcommand(parsed.positionals[1] ?? null);
  const firstArgIsSubcommand =
    subcommand !== "publish" ||
    parsed.positionals[1] === "publish" ||
    parsed.positionals[1] === "up" ||
    parsed.positionals[1] === "p";
  const todoIdInput =
    getStringOption(parsed, "id") ??
    parsed.positionals[firstArgIsSubcommand ? 2 : 1] ??
    null;

  if (!todoIdInput) {
    throw new CliError("Provide todo id with --id or positional id.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "TODO_ID_REQUIRED",
    });
  }

  const todoId = await resolveTodoId(config, todoIdInput);

  if (subcommand === "unpublish") {
    const query = new URLSearchParams({ sourceKind: "todo", sourceId: todoId });
    await requestJson<{ ok: true }>(
      config,
      `/api/publications/bri?${query.toString()}`,
      { method: "DELETE" },
      { action: "unpublish todo from Bri" },
    );

    if (outputJson) {
      printJson({ ok: true, id: todoId, status: "unpublished" });
      return;
    }

    logEvent("info", "publish.unpublish", { id: todoId });
    printOk(`unpublished ${todoId}`);
    return;
  }

  const { todo } = await requestJson<{ todo: TodoItem & { notesJson?: string | null } }>(
    config,
    `/api/todos/${todoId}`,
    { method: "GET" },
    { action: "load todo for publishing" },
  );
  const visibility = hasFlag(parsed, "private") ? "private" : "public";
  const title = getStringOption(parsed, "title") ?? todo.title;
  const result = await requestJson<{ ok: true; publication: PublicationRecord }>(
    config,
    "/api/publications/bri",
    {
      method: "POST",
      body: JSON.stringify({
        sourceKind: "todo",
        sourceId: todoId,
        title,
        notes: todo.notes,
        notesJson: todo.notesJson ?? null,
        visibility,
      }),
    },
    { action: "publish todo to Bri" },
  );

  if (outputJson) {
    printJson(result);
    return;
  }

  logEvent("info", "publish.bri", {
    id: todoId,
    publicationId: result.publication.id,
    visibility: result.publication.visibility,
  });
  printOk(`published ${todoId}`);
  print(result.publication.url);
}
