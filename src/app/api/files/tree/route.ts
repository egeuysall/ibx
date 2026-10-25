import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { serializeFile } from "@/lib/files-server";
import { buildFolderPaths, folderSlug } from "@/lib/file-folders";
import { buildFileTree } from "@/lib/file-tree";
import type { Doc } from "../../../../../convex/_generated/dataModel";

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateApiKeyPermission(request, auth);
  if (denied) return denied;

  const ownerKey = getRouteAuthOwnerKey(auth);
  const [folders, username] = await Promise.all([
    convex.query(api.attachments.listFileFolders, { ownerKey }),
    getRouteAuthUsername(auth),
  ]);
  const folderEntries = folders.map((folder) => ({
    id: folder._id,
    name: folder.name,
    slug: folder.slug || folderSlug(folder.name),
    parentFolderId: folder.parentFolderId ?? null,
  }));
  const paths = buildFolderPaths(folderEntries);
  const files = new Map<string, ReturnType<typeof serializeFile>>();
  let nextCursor: string | null = null;
  let isDone = false;
  let pages = 0;
  while (!isDone && pages < 100) {
    const cursor = nextCursor;
    const result: { page: Doc<"attachments">[]; isDone: boolean; continueCursor: string } = await convex.query(api.attachments.paginateFiles, {
      ownerKey,
      paginationOpts: { numItems: 50, cursor },
    });
    for (const file of result.page) {
      files.set(file._id, serializeFile(file, request.nextUrl.origin, username,
        file.folderId ? paths.get(file.folderId) ?? [] : []));
    }
    nextCursor = result.isDone ? null : result.continueCursor;
    isDone = result.isDone;
    pages += 1;
  }

  const root = buildFileTree(folderEntries, [...files.values()], paths);

  return NextResponse.json({ tree: root, truncated: !isDone }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
