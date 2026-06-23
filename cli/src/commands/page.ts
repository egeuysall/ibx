import { EXIT_CODE } from "../core/constants.js";
import { CliError } from "../core/errors.js";
import type { ParsedArgs } from "../core/types.js";
import { runTodosCommand } from "./todos.js";

function normalizePageSubcommand(value: string | null) {
  if (!value) {
    return "create";
  }

  if (value === "create" || value === "new" || value === "add" || value === "c") {
    return "create";
  }

  return value;
}

export async function runPageCommand(parsed: ParsedArgs) {
  const subcommand = normalizePageSubcommand(parsed.positionals[1] ?? null);

  if (subcommand === "create") {
    await runTodosCommand({
      ...parsed,
      positionals: ["todos", "add", ...parsed.positionals.slice(2)],
    });
    return;
  }

  throw new CliError(`Unknown page subcommand: ${subcommand}`, {
    exitCode: EXIT_CODE.VALIDATION,
    code: "PAGE_SUBCOMMAND_INVALID",
  });
}
