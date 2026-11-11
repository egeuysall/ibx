import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { runLandingShellCommand } from "./shell.mjs";

const ROOT = "/tmp/ibx-cli-demo-workspaces";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SESSION_MAX_AGE_MS = 60 * 60 * 8 * 1000;
const MAX_OUTPUT = 24_000;
const TIMEOUT_MS = 7_000;

function runProcess(args, cwd, env, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["/app/ibx.mjs", ...args], { cwd, env: { ...env, HOME: cwd, XDG_CONFIG_HOME: cwd }, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, TIMEOUT_MS);
    const append = (chunk) => {
      if (size >= MAX_OUTPUT) return;
      const bounded = chunk.subarray(0, MAX_OUTPUT - size);
      chunks.push(bounded);
      size += bounded.length;
      if (bounded.length < chunk.length) child.kill("SIGKILL");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8").trim();
      resolve({ output: timedOut ? `${output}\ncommand timed out after ${TIMEOUT_MS / 1000} seconds.`.trim() : output, code });
    });
    child.stdin.end(stdin ?? "");
  });
}

async function handle(payload) {
  const { sessionId, kind, args, stdin, env, files, filesBase64, overwrite, origin } = payload;
  if (typeof sessionId !== "string" || !SESSION_PATTERN.test(sessionId)) throw new Error("bad session");
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new Error("bad args");
  const home = join(ROOT, sessionId);
  const previous = await stat(home).catch(() => null);
  if (previous && Date.now() - previous.mtimeMs > SESSION_MAX_AGE_MS) await rm(home, { recursive: true, force: true });
  await mkdir(home, { recursive: true, mode: 0o700 });

  for (const [name, content] of Object.entries(files ?? {})) {
    if (typeof content !== "string") continue;
    await writeFile(join(home, basename(name)), content, { mode: 0o600, flag: "wx" }).catch(() => undefined);
  }

  for (const [name, b64] of Object.entries(filesBase64 ?? {})) {
    if (typeof b64 !== "string") continue;
    await writeFile(join(home, basename(name)), Buffer.from(b64, "base64"), { mode: 0o600, flag: overwrite ? "w" : "wx" }).catch(() => undefined);
  }

  if (kind === "shell") return { output: (await runLandingShellCommand(args, home, origin)) ?? "", code: 0 };
  if (kind === "cli") {
    return runProcess(args, home, {
      NODE_ENV: "production",
      IBX_DISABLE_UPDATE_CHECK: "1",
      PATH: process.env.PATH ?? "",
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
      ...(env && typeof env === "object" ? Object.fromEntries(Object.entries(env).filter(([key, value]) => /^IBX_[A-Z_]+$/.test(key) && typeof value === "string")) : {}),
    }, stdin);
  }
  throw new Error("bad kind");
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") { response.writeHead(200).end("ok"); return; }
  if (request.method !== "POST" || request.url !== "/run") { response.writeHead(404).end(); return; }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 200_000) { response.writeHead(413).end(); return; } chunks.push(chunk); }
  try {
    const result = await handle(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }));
  }
}).listen(8080);
