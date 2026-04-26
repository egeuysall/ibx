import { EXIT_CODE } from "./constants.js";
import { CliError } from "./errors.js";

export function normalizeBaseUrl(input: string) {
  const raw = input.trim();
  if (!raw) {
    throw new CliError("Base URL is required.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "BASE_URL_REQUIRED",
    });
  }

  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError("Base URL must use http or https.", {
      exitCode: EXIT_CODE.VALIDATION,
      code: "BASE_URL_PROTOCOL",
    });
  }

  return url.toString().replace(/\/$/, "");
}
