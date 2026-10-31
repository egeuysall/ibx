import { randomBytes } from "node:crypto";
import type { FunctionReturnType } from "convex/server";
import { api, convex } from "@/lib/convex-server";
import { buildFolderPaths, folderSlug } from "@/lib/file-folders";
import { LANDING_SESSION_PATTERN } from "@/lib/landing-demo";
import { initializeLandingDemoWorkspace } from "@/lib/landing-demo-workspace";

function readSessionId(request: Request) {
  const value = request.headers.get("x-ibx-demo-session");
  return value && LANDING_SESSION_PATTERN.test(value) ? value : randomBytes(24).toString("base64url");
}

export async function GET(request: Request) {
  const sessionId = readSessionId(request);
  const requestedFolderId = new URL(request.url).searchParams.get("folder");
  try {
    const siteUrl = process.env.NODE_ENV === "development"
      ? new URL(request.url).origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ibx.egeuysal.com").replace(/\/+$/, "");
    const demo = await initializeLandingDemoWorkspace(sessionId, siteUrl);

    const [allTasks, folderResult] = await Promise.all([
      convex.query(api.todos.listAll, { ownerKey: demo.ownerKey }),
      convex.query(api.attachments.listFileFolders, { ownerKey: demo.ownerKey }),
    ]);
    const folders = folderResult;

    const todayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const tasks = allTasks
      // dueDate is stored as a UTC date-only timestamp. Formatting it in
      // Chicago shifts midnight to the prior day and hides today's tasks.
      .filter((task) => task.status === "open" && task.dueDate != null && new Date(task.dueDate).toISOString().slice(0, 10) === todayKey)
      .sort((a, b) => (a.timeBlockStart ?? a.dueDate ?? a.createdAt) - (b.timeBlockStart ?? b.dueDate ?? b.createdAt))
      .slice(0, 10)
      .map((task) => ({
        title: task.title,
        detail: [
          task.priority === 1 ? "high" : task.priority === 3 ? "low" : "normal",
          typeof task.estimatedHours === "number" ? `${task.estimatedHours}h` : "",
        ].filter(Boolean).join(" · "),
        when: typeof task.timeBlockStart === "number"
          ? new Date(task.timeBlockStart).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false })
          : "",
      }));

    const folderRows = folders.map((folder) => ({
      id: folder._id,
      name: folder.name,
      slug: folder.slug || folderSlug(folder.name),
      parentFolderId: folder.parentFolderId ?? null,
    }));
    const paths = buildFolderPaths(folderRows);
    const files: Array<{ id: string; name: string; path: string; size: string; href: string; folderId: string | null }> = [];
    let cursor: string | null = null;
    let done = false;
    for (let page = 0; !done && page < 3; page += 1) {
      const result: FunctionReturnType<typeof api.attachments.paginateFiles> = await convex.query(api.attachments.paginateFiles, {
        ownerKey: demo.ownerKey,
        paginationOpts: { numItems: 40, cursor },
      });
      for (const file of result.page) {
        const folderPath = file.folderId ? paths.get(file.folderId)?.join("/") ?? "" : "";
        files.push({
          id: file._id,
          name: file.fileName,
          path: `/${[folderPath, file.fileName].filter(Boolean).join("/")}`,
          size: file.size < 1_000_000 ? `${Math.max(1, Math.round(file.size / 1_000))} kb` : `${(file.size / 1_000_000).toFixed(1)} mb`,
          href: `/api/landing-drive/${encodeURIComponent(file._id)}?demo=${encodeURIComponent(sessionId)}`,
          folderId: file.folderId ?? null,
        });
      }
      done = result.isDone;
      cursor = result.isDone ? null : result.continueCursor;
    }

    const selectedFolder = requestedFolderId ? folderRows.find((folder) => folder.id === requestedFolderId) : null;
    const parentFolderId = selectedFolder?.id ?? null;
    const visibleFolders = folderRows.filter((folder) => folder.parentFolderId === parentFolderId).map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: `/${paths.get(folder.id)?.join("/") ?? folder.slug}`,
        size: "folder",
        href: `/landing-drive?folder=${encodeURIComponent(folder.id)}&demo=${encodeURIComponent(sessionId)}`,
      }));
    const visibleFiles = files.filter((file) => file.folderId === parentFolderId).map(({ folderId: _folderId, ...file }) => file);
    const drive = [...visibleFolders, ...visibleFiles].slice(0, 10);
    return Response.json({ tasks: tasks.slice(0, 10), drive, folderName: selectedFolder?.name.toLowerCase() ?? "drive" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[landing-workspace] failed to load demo data", error);
    return Response.json({
      tasks: [],
      drive: [],
      ...(process.env.NODE_ENV === "development" && error instanceof Error ? { detail: error.message } : {}),
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
