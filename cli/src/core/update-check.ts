import process from "node:process";

import { DEFAULT_BASE_URL, UPDATE_CHECK_INTERVAL_MS, UPDATE_CHECK_TIMEOUT_MS, VERSION } from "./constants.js";
import { getStringOption } from "./args.js";
import { loadConfig } from "./config.js";
import { logEvent, printInfo, printWarn } from "./output.js";
import { isVersionNewer, parseSemver } from "./semver.js";
import type { CliVersionManifest, ParsedArgs, UpdateCheckCache } from "./types.js";
import { loadUpdateCheckCache, saveUpdateCheckCache } from "./update-cache.js";
import { normalizeBaseUrl } from "./url.js";
import { normalizeAuthSubcommand } from "../commands/normalize.js";

async function fetchLatestCliVersion(baseUrl: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort("timeout"),
    UPDATE_CHECK_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${baseUrl}/ibx-version.json`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": `ibx/${VERSION}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as
      | CliVersionManifest
      | null;
    if (!payload || typeof payload.version !== "string") {
      return null;
    }

    return parseSemver(payload.version) ? payload.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkForCliUpdates(command: string | undefined, parsed: ParsedArgs) {
  if (process.env.IBX_DISABLE_UPDATE_CHECK === "1") {
    return;
  }

  let baseUrl = DEFAULT_BASE_URL;
  if (
    command === "auth" &&
    normalizeAuthSubcommand(parsed.positionals[1] ?? "status") === "login"
  ) {
    const loginUrl = getStringOption(parsed, "url");
    if (loginUrl) {
      try {
        baseUrl = normalizeBaseUrl(loginUrl);
      } catch {
        baseUrl = DEFAULT_BASE_URL;
      }
    }
  } else {
    const config = await loadConfig();
    if (config?.baseUrl) {
      baseUrl = config.baseUrl;
    }
  }

  const now = Date.now();
  const existingCache = await loadUpdateCheckCache();
  let cache: UpdateCheckCache =
    existingCache ?? {
      lastCheckedAt: 0,
      baseUrl,
      latestVersion: null,
      lastNotifiedVersion: null,
    };
  const shouldRefresh =
    cache.baseUrl !== baseUrl ||
    now - cache.lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS;

  if (shouldRefresh) {
    const latestVersion = await fetchLatestCliVersion(baseUrl);
    cache = {
      ...cache,
      baseUrl,
      lastCheckedAt: now,
      latestVersion,
      lastNotifiedVersion:
        latestVersion && latestVersion === cache.lastNotifiedVersion
          ? cache.lastNotifiedVersion
          : null,
    };
    await saveUpdateCheckCache(cache).catch(() => undefined);
  }

  if (!cache.latestVersion || !isVersionNewer(cache.latestVersion, VERSION)) {
    return;
  }

  if (cache.lastNotifiedVersion === cache.latestVersion) {
    return;
  }

  printWarn(`cli update available: ${VERSION} -> ${cache.latestVersion}`);
  printInfo(`update with: curl -fsSL ${baseUrl}/install.sh | bash`);
  logEvent("warn", "cli.update.available", {
    currentVersion: VERSION,
    latestVersion: cache.latestVersion,
    baseUrl,
  });

  cache.lastNotifiedVersion = cache.latestVersion;
  await saveUpdateCheckCache(cache).catch(() => undefined);
}
