import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { api, convex } from "@/lib/convex-server";
import { LANDING_SESSION_PATTERN } from "@/lib/landing-demo";
import { initializeLandingDemoWorkspace } from "@/lib/landing-demo-workspace";
import { runLandingShellCommand } from "@/lib/landing-shell";

const execFileAsync = promisify(execFile);
const cliPath = join(process.cwd(), "public", "ibx");
let running = 0;
const MAX_CONCURRENT_DEMOS = 8;
const SESSION_MAX_AGE = 60 * 60 * 8;
const busySessions = new Set<string>();

export const runtime = "nodejs";

function publicDemoBlockReason(args: string[]) {
  const first = args[0]?.toLowerCase();
  const second = args[1]?.toLowerCase();
  const command = first === "a" ? "auth" : first === "t" || first === "td" ? "todos" : first === "n" ? "add" : first === "cal" || first === "c" ? "calendar" : first === "pages" ? "page" : first === "mkdir" ? "files" : first;
  const subcommand = first === "td" ? "today-done" : second;
  if (
    command === "self-update" ||
    command === "login" ||
    (command === "auth" && ["login", "l", "in", "logout", "out", "o"].includes(subcommand ?? ""))
  ) {
    return "Sign-in and self-update are disabled in the public demo.";
  }
  if (args.some((arg) => arg === "--api-key" || arg.startsWith("--api-key="))) {
    return "Never paste an API key into the public demo. Sign in to use account commands.";
  }
  if (command === "publish") return "Publishing to bri is disabled in the public terminal.";
  if (args.some((arg) => arg === "--url" || arg === "--base-url")) {
    return "Custom API endpoints are disabled in the public demo.";
  }
  return null;
}

function getOptionValue(args: string[], option: string) {
  const index = args.indexOf(option);
  if (index >= 0) return args[index + 1] ?? null;
  return args.find((arg) => arg.startsWith(`${option}=`))?.slice(option.length + 1) ?? null;
}

function getLocalFileArgument(args: string[]) {
  const command = args[0]?.toLowerCase();
  const subcommand = args[1]?.toLowerCase();
  if (command === "files" && subcommand === "upload") {
    return getOptionValue(args, "--file") ?? args[2] ?? null;
  }
  if (command === "attach" && subcommand !== "list") {
    return getOptionValue(args, "--file") ?? (args.length === 2 ? args[1] : args[2]) ?? null;
  }
  return null;
}

function escapesWorkspace(home: string, filePath: string) {
  if (isAbsolute(filePath) || /^[a-z]:[\\/]/i.test(filePath)) return true;
  const resolved = resolve(home, filePath);
  const pathFromWorkspace = relative(home, resolved);
  return pathFromWorkspace === ".." || pathFromWorkspace.startsWith(`..${sep}`) || isAbsolute(pathFromWorkspace);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 4096) {
    return Response.json({ error: "Command is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Send a valid JSON command." }, { status: 400 });
  }

  const rawArgs = (body as { args?: unknown } | null)?.args;
  if (
    !Array.isArray(rawArgs) ||
    rawArgs.length > 48 ||
    rawArgs.some((arg) => typeof arg !== "string" || arg.length > 800 || arg.includes("\0"))
  ) {
    return Response.json({ error: "Send a valid ibx command." }, { status: 400 });
  }

  const args = rawArgs as string[];
  const cliArgs = args[0] === "ibx" ? args.slice(1) : args;
  if (cliArgs.length === 0) cliArgs.push("--help");

  const requestedSession = request.headers.get("x-ibx-demo-session");
  const sessionId = requestedSession && LANDING_SESSION_PATTERN.test(requestedSession) ? requestedSession : randomBytes(24).toString("base64url");
  if (busySessions.has(sessionId)) return Response.json({ error: "This terminal is already running a command." }, { status: 429 });

  if (running >= MAX_CONCURRENT_DEMOS) {
    return Response.json({ error: "The public CLI session is busy. Try again shortly." }, { status: 429 });
  }

  running += 1;
  busySessions.add(sessionId);
  const home = join(tmpdir(), "ibx-cli-demo-workspaces", sessionId);
  const appBaseUrl = process.env.NODE_ENV === "development"
    ? new URL(request.url).origin
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ibx.egeuysal.com").replace(/\/+$/, "");
  try {
    const previous = await stat(home).catch(() => null);
    if (previous && Date.now() - previous.mtimeMs > SESSION_MAX_AGE * 1000) {
      await rm(home, { recursive: true, force: true });
    }
    await mkdir(home, { recursive: true, mode: 0o700 });

    if (args[0]?.toLowerCase() !== "ibx") {
      const output = await runLandingShellCommand(cliArgs, home, appBaseUrl);
      return sendResult(request, sessionId, { output: output ?? "" });
    }

    const blockReason = publicDemoBlockReason(cliArgs);
    if (blockReason) return sendResult(request, sessionId, { output: blockReason });

    const demoAccount = await initializeLandingDemoWorkspace(sessionId, appBaseUrl);
    const demoApiKey = demoAccount.apiKey;
    const localFileArgument = getLocalFileArgument(cliArgs);
    if (localFileArgument && escapesWorkspace(home, localFileArgument)) {
      return sendResult(request, sessionId, { output: "file paths must stay inside the temporary cli workspace." });
    }
    const cliEnv = {
      NODE_ENV: process.env.NODE_ENV ?? "production",
      PATH: process.env.PATH ?? "",
      HOME: home,
      XDG_CONFIG_HOME: home,
      IBX_PUBLIC_DEMO_API_KEY: demoApiKey,
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
      IBX_DISABLE_UPDATE_CHECK: "1",
      IBX_BASE_URL: appBaseUrl,
    };
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...cliArgs], {
      cwd: home,
      timeout: 6000,
      maxBuffer: 24_000,
      env: cliEnv,
    });
    return sendResult(request, sessionId, { output: `${stdout}${stderr}`.trim() });
  } catch (error) {
    console.error("[landing-cli] command failed", error instanceof Error ? error.message : "unknown error");
    const output = error && typeof error === "object"
      ? `${"stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : ""}${"stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : ""}`.trim()
      : "";
    return sendResult(request, sessionId, { output: output || "The CLI command could not run. Try again shortly." });
  } finally {
    running = Math.max(0, running - 1);
    busySessions.delete(sessionId);
  }
}

function sendResult(_request: Request, _sessionId: string, payload: { output: string }) {
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
