import process from "node:process";

import { EXIT_CODE, VERSION } from "./core/constants.js";
import { hasFlag, parseArgs } from "./core/args.js";
import { checkForCliUpdates } from "./core/update-check.js";
import { CliError } from "./core/errors.js";
import { color, print } from "./core/output.js";
import type { ParsedArgs } from "./core/types.js";
import { runAddCommand } from "./commands/add.js";
import { runAuthCommand } from "./commands/auth.js";
import { runCalendarCommand } from "./commands/calendar.js";
import { runTodosCommand } from "./commands/todos.js";
import { renderHelpUi } from "./ui/pastel.js";

function normalizeTopLevelCommand(parsed: ParsedArgs) {
  const first = parsed.positionals[0];
  const normalizedFirst =
    first === "a"
      ? "auth"
      : first === "n"
        ? "add"
        : first === "t"
          ? "todos"
          : first === "cal" || first === "c"
            ? "calendar"
            : first === "td"
              ? "todos"
              : first;
  const normalizedParsed: ParsedArgs =
    first === "td"
      ? {
          ...parsed,
          positionals: ["todos", "today-done", ...parsed.positionals.slice(1)],
        }
      : first === "a" || first === "n" || first === "t" || first === "cal" || first === "c"
        ? {
            ...parsed,
            positionals: [normalizedFirst as string, ...parsed.positionals.slice(1)],
          }
        : parsed;

  return { normalizedFirst, normalizedParsed };
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const { normalizedFirst, normalizedParsed } = normalizeTopLevelCommand(parsed);

  if (hasFlag(parsed, "help") || normalizedFirst === "help") {
    await renderHelpUi();
    return;
  }

  if (hasFlag(parsed, "version") || normalizedFirst === "version") {
    print(VERSION);
    return;
  }

  if (!normalizedFirst) {
    await checkForCliUpdates(normalizedFirst, normalizedParsed);
    print(`${color.bold("ibx")} ${color.gray("quick capture")}`);
    await runAddCommand({
      ...normalizedParsed,
      positionals: ["add"],
    });
    return;
  }

  await checkForCliUpdates(normalizedFirst, normalizedParsed);

  if (normalizedFirst === "auth") {
    await runAuthCommand(normalizedParsed);
    return;
  }

  if (normalizedFirst === "add") {
    await runAddCommand(normalizedParsed);
    return;
  }

  if (normalizedFirst === "todos") {
    await runTodosCommand(normalizedParsed);
    return;
  }

  if (normalizedFirst === "calendar") {
    await runCalendarCommand(normalizedParsed);
    return;
  }

  throw new CliError(`Unknown command: ${normalizedFirst}`, {
    exitCode: EXIT_CODE.VALIDATION,
    code: "COMMAND_INVALID",
  });
}
