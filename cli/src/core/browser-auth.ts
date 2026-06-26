import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import process from "node:process";

import { DEFAULT_TIMEOUT_MS, EXIT_CODE, VERSION } from "./constants.js";
import { CliError } from "./errors.js";
import { mapStatusToExitCode } from "./http.js";

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const AUTH_TIMEOUT_MS = 3 * 60 * 1000;

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function writeHtml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`<!doctype html><html><body><p>${body}</p></body></html>`);
}

function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  child.on("error", () => undefined);
}

async function exchangeCode(input: {
  baseUrl: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort("timeout"),
    DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${input.baseUrl}/api/cli-auth/token`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `ibx/${VERSION}`,
      },
      body: JSON.stringify({
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectUri: input.redirectUri,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      apiKey?: unknown;
      authType?: unknown;
      permission?: unknown;
      error?: string;
    };

    if (!response.ok || typeof payload.apiKey !== "string") {
      throw new CliError(
        payload.error || `CLI auth failed (${response.status}).`,
        {
          exitCode: mapStatusToExitCode(response.status),
          code: `CLI_AUTH_${response.status}`,
        },
      );
    }

    return {
      apiKey: payload.apiKey,
      authType:
        typeof payload.authType === "string" ? payload.authType : "clerk-browser",
      permission:
        typeof payload.permission === "string" ? payload.permission : "both",
    };
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError("CLI browser auth token exchange failed.", {
      exitCode: EXIT_CODE.NETWORK,
      code: "CLI_AUTH_NETWORK",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runBrowserAuthLogin(
  baseUrl: string,
  onAuthorizeUrl: (url: string) => void,
) {
  const state = randomBase64Url();
  const codeVerifier = randomBase64Url();
  const codeChallenge = sha256Base64Url(codeVerifier);

  const server = createServer();
  const redirectUri = await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, CALLBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(
          new CliError("Could not start local CLI auth callback server.", {
            exitCode: EXIT_CODE.NETWORK,
            code: "CLI_AUTH_CALLBACK_UNAVAILABLE",
          }),
        );
        return;
      }
      resolve(`http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`);
    });
  });

  const authorizeUrl = new URL("/cli-auth", baseUrl);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);

  const result = await new Promise<{
    apiKey: string;
    authType: string;
    permission: string;
  }>((resolve, reject) => {
    let settled = false;
    const finish = (
      callback: typeof resolve | typeof reject,
      value: Parameters<typeof resolve>[0] | Error,
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      server.close(() => undefined);
      callback(value as never);
    };

    const timeout = setTimeout(() => {
      finish(
        reject,
        new CliError("CLI browser auth timed out.", {
          exitCode: EXIT_CODE.AUTH,
          code: "CLI_AUTH_TIMEOUT",
        }),
      );
    }, AUTH_TIMEOUT_MS);

    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        const requestUrl = new URL(request.url ?? "/", redirectUri);
        const hasAuthResponse =
          requestUrl.searchParams.has("code") &&
          requestUrl.searchParams.has("state");

        if (request.method !== "GET") {
          writeHtml(response, 405, "Method not allowed.");
          return;
        }

        if (
          !hasAuthResponse &&
          requestUrl.pathname !== CALLBACK_PATH &&
          requestUrl.pathname !== "/"
        ) {
          writeHtml(response, 404, "ibx CLI login callback is not available here.");
          return;
        }

        if (!hasAuthResponse) {
          writeHtml(response, 200, "ibx CLI login is waiting for authorization.");
          return;
        }

        const returnedState = requestUrl.searchParams.get("state");
        const code = requestUrl.searchParams.get("code");
        if (returnedState !== state || !code) {
          writeHtml(response, 400, "Invalid ibx CLI login response.");
          finish(
            reject,
            new CliError("Invalid CLI auth callback.", {
              exitCode: EXIT_CODE.AUTH,
              code: "CLI_AUTH_CALLBACK_INVALID",
            }),
          );
          return;
        }

        try {
          const exchanged = await exchangeCode({
            baseUrl,
            code,
            codeVerifier,
            redirectUri,
          });
          writeHtml(response, 200, "ibx CLI is connected. You can close this tab.");
          finish(resolve, exchanged);
        } catch (error) {
          writeHtml(response, 500, "ibx CLI login failed. Return to terminal.");
          finish(
            reject,
            error instanceof Error
              ? error
              : new CliError("CLI auth failed.", {
                  exitCode: EXIT_CODE.AUTH,
                  code: "CLI_AUTH_FAILED",
                }),
          );
        }
      })();
    });

    onAuthorizeUrl(authorizeUrl.toString());
    openBrowser(authorizeUrl.toString());
  });

  return result;
}
