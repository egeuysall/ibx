import { getStringOption, hasFlag } from "../core/args.js";
import { requireConfig } from "../core/config.js";
import { EXIT_CODE } from "../core/constants.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { logEvent, print, printJson, printOk } from "../core/output.js";
import type { ParsedArgs, TodoItem } from "../core/types.js";
import { printTodoList } from "../todos/format.js";

export async function runSyncCommand(parsed: ParsedArgs) {
  const outputJson = hasFlag(parsed, "json");
  const config = await requireConfig();
  const sinceRaw = getStringOption(parsed, "since");
  const since =
    sinceRaw === null
      ? null
      : Number.isFinite(Number(sinceRaw))
        ? Number(sinceRaw)
        : Number.NaN;

  if (Number.isNaN(since)) {
    throw new CliError("--since must be a unix millisecond timestamp.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "SYNC_SINCE_INVALID",
    });
  }

  const query = since === null ? "" : `?since=${encodeURIComponent(String(since))}`;
  const result = await requestJson<{ todos: TodoItem[]; serverNow: number }>(
    config,
    `/api/sync${query}`,
    { method: "GET" },
    { action: "pull sync state" },
  );

  if (outputJson) {
    printJson(result);
    return;
  }

  logEvent("info", "sync.pull", {
    count: result.todos.length,
    serverNow: result.serverNow,
  });
  printOk(`synced ${result.todos.length} todo${result.todos.length === 1 ? "" : "s"}`);
  if (result.todos.length > 0) {
    print("");
    printTodoList(result.todos, "all");
  }
}
