import "server-only";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { api, convex } from "@/lib/convex-server";
import { ensureSessionDemoAccount } from "@/lib/landing-demo";

const execFileAsync = promisify(execFile);
const cliPath = join(process.cwd(), "public", "ibx");
const sampleUrl = "https://ibx.egeuysal.com/egeuysall/jei-run.jpg";
const sampleName = "jei-run.jpg";
const sampleLimit = 100_000;
const initialTasks = ["finish the first draft", "send the notes", "review the launch plan", "take a walk"];
const initializations = new Map<string, Promise<Awaited<ReturnType<typeof ensureSessionDemoAccount>>>>();

export function initializeLandingDemoWorkspace(sessionId: string, siteUrl: string) {
  let pending = initializations.get(sessionId);
  if (!pending) {
    pending = seedWorkspace(sessionId, siteUrl).catch((error) => {
      initializations.delete(sessionId);
      throw error;
    });
    initializations.set(sessionId, pending);
  }
  return pending;
}

async function seedWorkspace(sessionId: string, siteUrl: string) {
  const demo = await ensureSessionDemoAccount(sessionId);
  const home = join(tmpdir(), "ibx-cli-demo-workspaces", sessionId);
  await mkdir(home, { recursive: true, mode: 0o700 });
  const env = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CONFIG_HOME: home,
    IBX_PUBLIC_DEMO_API_KEY: demo.apiKey,
    FORCE_COLOR: "1",
    TERM: "xterm-256color",
    IBX_DISABLE_UPDATE_CHECK: "1",
    IBX_BASE_URL: siteUrl,
  };
  const runCli = (args: string[]) => execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: home,
    timeout: 8_000,
    maxBuffer: 24_000,
    env,
  });

  if (demo.created) {
    await Promise.all(initialTasks.map((title) => runCli(["todos", "add", title]).catch(() => undefined)));
  }

  let folders = await convex.query(api.attachments.listFileFolders, { ownerKey: demo.ownerKey });
  let researchFolder = folders.find((folder) => folder.name.toLowerCase() === "research" && !folder.parentFolderId);
  if (!researchFolder) {
    await runCli(["files", "mkdir", "/research"]).catch(() => undefined);
    folders = await convex.query(api.attachments.listFileFolders, { ownerKey: demo.ownerKey });
    researchFolder = folders.find((folder) => folder.name.toLowerCase() === "research" && !folder.parentFolderId);
  }
  if (!researchFolder) return demo;

  const files = await convex.query(api.attachments.paginateFiles, {
    ownerKey: demo.ownerKey,
    paginationOpts: { numItems: 100, cursor: null },
  });
  if (files.page.some((file) => file.fileName === sampleName && file.folderId === researchFolder?._id)) return demo;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(sampleUrl, { signal: controller.signal, redirect: "error", cache: "force-cache" });
    const declaredSize = Number(response.headers.get("content-length"));
    if (!response.ok || (Number.isFinite(declaredSize) && declaredSize > sampleLimit)) return demo;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > sampleLimit) return demo;
    await writeFile(join(home, sampleName), bytes, { mode: 0o600 });
    await runCli(["files", "upload", sampleName, "--folder", researchFolder._id]).catch(() => undefined);
  } catch {
    // Keep the demo workspace usable even when the public sample is unavailable.
  } finally {
    clearTimeout(timeout);
  }
  return demo;
}
