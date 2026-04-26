import { EXIT_CODE, type ExitCode } from "./constants.js";

export class CliError extends Error {
  exitCode: ExitCode;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      exitCode?: ExitCode;
      code?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = options?.exitCode ?? EXIT_CODE.UNKNOWN;
    this.code = options?.code ?? "UNKNOWN";
    this.details = options?.details;
  }
}

export function isInterruptedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ((error as { code?: string }).code === "ABORT_ERR") {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes("ctrl+c") || message.includes("interrupted");
}
