import { createHash, randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function writeHtml(
  response: ServerResponse,
  status: number,
  body: string,
  action?: { label: string; href: string },
) {
  const actionHtml = action
    ? `<a class="button" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
    : "";

  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="dark" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ibx CLI</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #000;
        color: #d4d4d4;
        font: 13px/1.5 "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      main {
        display: grid;
        gap: 14px;
        justify-items: start;
        transform: translateY(-5vh);
      }
      .brand {
        position: fixed;
        top: 20px;
        left: 20px;
        color: #d4d4d4;
        font-size: 13px;
        font-weight: 600;
      }
      .eyebrow {
        color: #525252;
        font-size: 12px;
      }
      p {
        margin: 0;
        color: #a3a3a3;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        min-width: 92px;
        height: 30px;
        padding: 0 12px;
        border: 1px solid #1f1f1f;
        border-radius: 4px;
        background: #0a0a0a;
        color: #d4d4d4;
        text-decoration: none;
        font-size: 12px;
      }
      .button:hover {
        background: #111;
        border-color: #2a2a2a;
      }
    </style>
  </head>
  <body>
    <div class="brand">ibx</div>
    <main>
      <div class="eyebrow">cli auth</div>
      <p>${escapeHtml(body)}</p>
      ${actionHtml}
    </main>
  </body>
</html>`);
}

function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
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
        typeof payload.authType === "string"
          ? payload.authType
          : "clerk-browser",
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

    server.on(
      "request",
      (request: IncomingMessage, response: ServerResponse) => {
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
            writeHtml(
              response,
              404,
              "ibx CLI login callback is not available here.",
            );
            return;
          }

          if (!hasAuthResponse) {
            writeHtml(
              response,
              200,
              "ibx CLI login is waiting for authorization.",
            );
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
            writeHtml(
              response,
              200,
              "You're signed in and may close this tab",
              { label: "Open ibx", href: baseUrl },
            );
            finish(resolve, exchanged);
          } catch (error) {
            writeHtml(
              response,
              500,
              "ibx CLI login failed. Return to terminal.",
            );
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
      },
    );

    onAuthorizeUrl(authorizeUrl.toString());
    openBrowser(authorizeUrl.toString());
  });

  return result;
}
