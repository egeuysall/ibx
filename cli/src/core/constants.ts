import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export const CONFIG_FILE = join(homedir(), ".ibx", "config.json");
export const UPDATE_CHECK_FILE = join(homedir(), ".ibx", "update-check.json");
export const API_KEY_PREFIX = "iak_";
export const VERSION = "0.3.0";
export const DEFAULT_BASE_URL =
  process.env.IBX_BASE_URL?.trim() || "https://ibx.egeuysal.com";
export const APP_TIMEZONE = process.env.IBX_TIMEZONE?.trim() || "America/Chicago";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRIES = 2;
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 3_500;
export const EXIT_CODE = {
  UNKNOWN: 1,
  VALIDATION: 2,
  AUTH: 3,
  NETWORK: 4,
  SERVER: 5,
  NOT_FOUND: 6,
  CONFLICT: 7,
  RATE_LIMIT: 8,
} as const;
export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
