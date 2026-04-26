#!/usr/bin/env node

import process from "node:process";

import { EXIT_CODE } from "./core/constants.js";
import { CliError, isInterruptedError } from "./core/errors.js";
import { logEvent, printError } from "./core/output.js";
import { main } from "./router.js";

void main().catch((error) => {
  if (isInterruptedError(error)) {
    logEvent("info", "cli.interrupted");
    process.stderr.write("\n");
    process.exitCode = 130;
    return;
  }

  const cliError =
    error instanceof CliError
      ? error
      : new CliError(error instanceof Error ? error.message : String(error), {
          exitCode: EXIT_CODE.UNKNOWN,
          code: "UNHANDLED",
        });
  logEvent("error", "cli.failure", {
    code: cliError.code,
    exitCode: cliError.exitCode,
    ...(cliError.details ?? {}),
  });
  printError(cliError.message);
  process.exitCode = cliError.exitCode;
});
