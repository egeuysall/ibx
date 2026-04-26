import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { safeJsonStringify } from "flags";

import { API_KEY_PREFIX, CONFIG_FILE, EXIT_CODE } from "./constants.js";
import { CliError } from "./errors.js";
import type { CliConfig } from "./types.js";
import { normalizeBaseUrl } from "./url.js";

export async function loadConfig(): Promise<CliConfig | null> {
  const raw = await readFile(CONFIG_FILE, "utf8").catch(() => null);
  if (!raw) {
    return null;
  }

  const parsed = (() => {
    try {
      return JSON.parse(raw) as Partial<CliConfig>;
    } catch {
      return null;
    }
  })();
  if (!parsed) {
    return null;
  }
  if (
    typeof parsed.baseUrl !== "string" ||
    typeof parsed.apiKey !== "string" ||
    typeof parsed.createdAt !== "string"
  ) {
    return null;
  }

  if (!parsed.apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  try {
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl),
      apiKey: parsed.apiKey,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: CliConfig) {
  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  await writeFile(
    CONFIG_FILE,
    `${safeJsonStringify(config, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await chmod(CONFIG_FILE, 0o600).catch(() => undefined);
}

export async function clearConfig() {
  await rm(CONFIG_FILE, { force: true });
}

export async function requireConfig() {
  const config = await loadConfig();
  if (!config) {
    throw new CliError(
      'Not authenticated. Run "ibx auth login --api-key iak_..." first.',
      { exitCode: EXIT_CODE.AUTH, code: "AUTH_REQUIRED" },
    );
  }

  return config;
}
