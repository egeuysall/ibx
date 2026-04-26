import {
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  EXIT_CODE,
  VERSION,
  type ExitCode,
} from "./constants.js";
import { CliError } from "./errors.js";
import { logEvent } from "./output.js";
import type { CliConfig } from "./types.js";

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return null;
  }

  const asSeconds = Number.parseInt(value, 10);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds;
  }

  const asDate = Date.parse(value);
  if (!Number.isFinite(asDate)) {
    return null;
  }

  const diff = Math.ceil((asDate - Date.now()) / 1000);
  return diff > 0 ? diff : null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function mapStatusToExitCode(status: number): ExitCode {
  if (status === 400 || status === 422) {
    return EXIT_CODE.VALIDATION;
  }

  if (status === 401 || status === 403) {
    return EXIT_CODE.AUTH;
  }

  if (status === 404) {
    return EXIT_CODE.NOT_FOUND;
  }

  if (status === 409) {
    return EXIT_CODE.CONFLICT;
  }

  if (status === 429) {
    return EXIT_CODE.RATE_LIMIT;
  }

  if (status >= 500) {
    return EXIT_CODE.SERVER;
  }

  return EXIT_CODE.UNKNOWN;
}

export async function requestJson<T>(
  config: Pick<CliConfig, "baseUrl" | "apiKey">,
  path: string,
  init?: RequestInit,
  options?: {
    action?: string;
    retries?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const retries = options?.retries ?? (init?.method === "GET" ? DEFAULT_RETRIES : 0);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: CliError | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": `ibx/${VERSION}`,
          ...(init?.headers ?? {}),
        },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & T;

      if (response.ok) {
        return payload;
      }

      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get("retry-after"),
      );
      const message =
        payload.error ||
        `Request failed (${response.status})${options?.action ? ` while ${options.action}` : ""}.`;

      const cliError = new CliError(message, {
        exitCode: mapStatusToExitCode(response.status),
        code: `HTTP_${response.status}`,
        details: {
          status: response.status,
          retryAfterSeconds,
          action: options?.action ?? null,
        },
      });

      const canRetry =
        attempt < retries &&
        (response.status === 429 || response.status >= 500);
      if (canRetry) {
        const waitMs = retryAfterSeconds
          ? Math.min(5_000, retryAfterSeconds * 1_000)
          : Math.min(3_000, 250 * 2 ** attempt);
        logEvent("warn", "http.retry", {
          target: options?.action ?? path,
          status: response.status,
          attempt: attempt + 1,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      throw cliError;
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" ||
          String(error.message).toLowerCase().includes("abort"));
      const cliError =
        error instanceof CliError
          ? error
          : new CliError(
              timedOut
                ? `Request timed out after ${timeoutMs}ms${
                    options?.action ? ` while ${options.action}` : ""
                  }.`
                : `Network request failed${
                    options?.action ? ` while ${options.action}` : ""
                  }.`,
              {
                exitCode: EXIT_CODE.NETWORK,
                code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
                details: {
                  action: options?.action ?? null,
                },
              },
            );

      const canRetry = attempt < retries && cliError.exitCode === EXIT_CODE.NETWORK;
      if (canRetry) {
        const waitMs = Math.min(3_000, 200 * 2 ** attempt);
        logEvent("warn", "http.retry", {
          target: options?.action ?? path,
          code: cliError.code,
          attempt: attempt + 1,
          waitMs,
        });
        await sleep(waitMs);
        lastError = cliError;
        continue;
      }

      throw cliError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw (
    lastError ??
    new CliError("Request failed after retries.", {
      exitCode: EXIT_CODE.NETWORK,
      code: "RETRY_EXHAUSTED",
    })
  );
}

export async function verifyAuth(baseUrl: string, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), DEFAULT_TIMEOUT_MS);
  const response = await fetch(`${baseUrl}/api/session`, {
    method: "GET",
    signal: controller.signal,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": `ibx/${VERSION}`,
    },
  })
    .catch(() => null)
    .finally(() => clearTimeout(timeoutId));

  if (!response) {
    throw new CliError("Unable to reach server for auth verification.", {
      exitCode: EXIT_CODE.NETWORK,
      code: "AUTH_VERIFY_NETWORK",
    });
  }

  const payload = (await response.json().catch(() => ({}))) as {
    authenticated?: boolean;
    authType?: string;
    permission?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new CliError(
      payload.error || `Auth verification failed (${response.status}).`,
      {
        exitCode: mapStatusToExitCode(response.status),
        code: `AUTH_VERIFY_${response.status}`,
      },
    );
  }

  if (!payload.authenticated) {
    throw new CliError("API key is not valid for this server.", {
      exitCode: EXIT_CODE.AUTH,
      code: "AUTH_INVALID",
    });
  }

  return payload;
}
