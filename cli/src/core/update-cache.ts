import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { safeJsonStringify } from "flags";

import { UPDATE_CHECK_FILE } from "./constants.js";
import type { UpdateCheckCache } from "./types.js";

export async function loadUpdateCheckCache(): Promise<UpdateCheckCache | null> {
  const raw = await readFile(UPDATE_CHECK_FILE, "utf8").catch(() => null);
  if (!raw) {
    return null;
  }

  const parsed = (() => {
    try {
      return JSON.parse(raw) as Partial<UpdateCheckCache>;
    } catch {
      return null;
    }
  })();
  if (!parsed) {
    return null;
  }

  if (
    typeof parsed.lastCheckedAt !== "number" ||
    !Number.isFinite(parsed.lastCheckedAt) ||
    typeof parsed.baseUrl !== "string" ||
    (typeof parsed.latestVersion !== "string" && parsed.latestVersion !== null)
  ) {
    return null;
  }

  return {
    lastCheckedAt: parsed.lastCheckedAt,
    baseUrl: parsed.baseUrl,
    latestVersion: parsed.latestVersion,
    lastNotifiedVersion:
      typeof parsed.lastNotifiedVersion === "string"
        ? parsed.lastNotifiedVersion
        : null,
  };
}

export async function saveUpdateCheckCache(cache: UpdateCheckCache) {
  await mkdir(dirname(UPDATE_CHECK_FILE), { recursive: true });
  await writeFile(
    UPDATE_CHECK_FILE,
    `${safeJsonStringify(cache, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await chmod(UPDATE_CHECK_FILE, 0o600).catch(() => undefined);
}
