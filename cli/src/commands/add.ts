import process from "node:process";

import { EXIT_CODE } from "../core/constants.js";
import { getStringOption, hasFlag } from "../core/args.js";
import { requireConfig } from "../core/config.js";
import { getTodayDateKey } from "../core/dates.js";
import { CliError } from "../core/errors.js";
import { requestJson } from "../core/http.js";
import { resolveAiInput } from "../core/input.js";
import { logEvent, printInfo, printJson, printOk, printWarn } from "../core/output.js";
import type { ParsedArgs } from "../core/types.js";
import { resolveBooleanOption } from "../todos/parsing.js";

export async function runAddCommand(parsed: ParsedArgs) {
  const outputJson = hasFlag(parsed, "json");
  const config = await requireConfig();
  const input = await resolveAiInput(parsed);

  if (!input) {
    throw new CliError(
      'No input provided.\nexample: ibx add "finish landing page and email two leads"',
      { exitCode: EXIT_CODE.VALIDATION, code: "MISSING_INPUT" },
    );
  }
  if (input.length > 8_000) {
    throw new CliError("Input is too long (max 8000 chars).", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "INPUT_TOO_LONG",
    });
  }

  if (!outputJson) {
    logEvent("info", "todo.generate.start", { inputLength: input.length });
  }

  const preferences = {
    autoSchedule: resolveBooleanOption(parsed, "auto-schedule", true),
    includeRelevantLinks: resolveBooleanOption(parsed, "include-links", true),
    requireTaskDescriptions: resolveBooleanOption(
      parsed,
      "require-descriptions",
      true,
    ),
    availabilityNotes:
      getStringOption(parsed, "availability-notes") ??
      process.env.IBX_AVAILABILITY_NOTES?.trim() ??
      null,
  };

  const response = await requestJson<{
    ok: true;
    runId: string;
    created: number;
    updated?: number;
    deleted?: number;
    droppedMutationOps?: number;
    mode?: "create" | "mutate";
    message?: string | null;
  }>(config, "/api/todos/generate", {
    method: "POST",
    body: JSON.stringify({
      text: input,
      today: getTodayDateKey(),
      preferences,
    }),
  }, {
    action: "generate todos from prompt",
  });

  if (!outputJson) {
    logEvent("info", "todo.generate.done", {
      runId: response.runId,
      created: response.created,
      updated: response.updated ?? 0,
      deleted: response.deleted ?? 0,
      droppedMutationOps: response.droppedMutationOps ?? 0,
      mode: response.mode ?? "create",
    });
  }

  if (outputJson) {
    printJson(response);
    return;
  }

  printOk(`run ${response.runId}`);
  printOk(`created ${response.created} / updated ${response.updated ?? 0} / deleted ${response.deleted ?? 0}`);
  if ((response.droppedMutationOps ?? 0) > 0) {
    printWarn(
      `ignored ${response.droppedMutationOps} mutation op(s) outside current snapshot`,
    );
  }
  if (response.message) {
    printInfo(response.message);
  }
  if (response.created === 0 && (response.updated ?? 0) === 0 && (response.deleted ?? 0) === 0) {
    printWarn(
      "ai did not apply changes (likely duplicate/no-op input)",
    );
  }
}
