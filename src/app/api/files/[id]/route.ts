import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { deleteStoredFile, migrateFileToR2, serializeFile } from "@/lib/files-server";
import { buildFolderPaths, folderSlug } from "@/lib/file-folders";
import { DELETE as deleteAttachment } from "../../attachments/[attachmentId]/route";
import type { Doc } from "../../../../../convex/_generated/dataModel";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.clone().json().catch(() => null);
  if (body?.type === "folder") {
    const auth = await getRouteAuth(request);
    if (!auth) return unauthorizedJson();
    const denied = validateCsrfForSessionAuth(request, auth) ?? validateApiKeyPermission(request, auth);
    if (denied) return denied;
    if (!/^[a-z0-9]{20,64}$/.test(id)) return NextResponse.json({ error: "Folder not found." }, { status: 404 });

    const ownerKey = getRouteAuthOwnerKey(auth);
    try {
      const folders = await convex.query(api.attachments.listFileFolders, { ownerKey });
      if (!folders.some((folder) => folder._id === id)) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
      const folderIds = new Set([id]);
      let added = true;
      while (added) {
        added = false;
        for (const folder of folders) {
          if (folder.parentFolderId && folderIds.has(folder.parentFolderId) && !folderIds.has(folder._id)) {
            folderIds.add(folder._id);
            added = true;
          }
        }
      }

      const files: Doc<"attachments">[] = [];
      for (const folderId of folderIds) {
        let cursor: string | null = null;
        const cursors = new Set<string>();
        while (true) {
          const result: {
            page: Doc<"attachments">[];
            isDone: boolean;
            continueCursor: string;
          } = await convex.query(api.attachments.paginateFilesInFolder, {
            ownerKey,
            folderId: folderId as never,
            paginationOpts: { numItems: 100, cursor },
          });
          files.push(...result.page);
          if (result.isDone || !result.continueCursor || cursors.has(result.continueCursor)) break;
          cursors.add(result.continueCursor);
          cursor = result.continueCursor;
        }
      }

      for (let index = 0; index < files.length; index += 8) {
        const results = await Promise.allSettled(files.slice(index, index + 8).map(deleteStoredFile));
        if (results.some((result) => result.status === "rejected")) {
          return NextResponse.json({ error: "Could not delete every file in this folder. Retry to finish; already deleted files stay deleted." }, { status: 500 });
        }
      }

      const deleted = await convex.mutation(api.attachments.deleteFileFolderTree, { ownerKey, folderId: id as never });
      if (!deleted) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
      return NextResponse.json({ ok: true, deletedFiles: files.length, deletedFolders: deleted.deletedFolders },
        { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return NextResponse.json({ error: "Could not delete the folder. Reload and retry; any files already deleted stay deleted." }, { status: 500 });
    }
  }
  return deleteAttachment(request, { params: Promise.resolve({ attachmentId: id }) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateCsrfForSessionAuth(request, auth) ?? validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-z0-9]{20,64}$/.test(id)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const ownerKey = getRouteAuthOwnerKey(auth);
  if (body && Object.prototype.hasOwnProperty.call(body, "fileName")) {
    if (typeof body.fileName !== "string" || !body.fileName.trim() || body.fileName.length > 180 || /[\/\\\u0000-\u001f\u007f]/.test(body.fileName)) {
      return NextResponse.json({ error: "File names must be 1–180 characters and cannot contain slashes or control characters." }, { status: 400 });
    }
    let renamed;
    try {
      renamed = await convex.mutation(api.attachments.renameFileItem, { ownerKey, itemId: id, name: body.fileName });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not rename file." }, { status: 400 });
    }
    if (!renamed) return NextResponse.json({ error: "File or folder not found." }, { status: 404 });
    if (renamed.type === "folder") return NextResponse.json({ ok: true, id: renamed.id, fileName: renamed.fileName, url: null, publicUrl: null, type: "folder" },
      { headers: { "Cache-Control": "private, no-store" } });
    const [file, folders, username] = await Promise.all([
      convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: id as never }),
      convex.query(api.attachments.listFileFolders, { ownerKey }),
      getRouteAuthUsername(auth),
    ]);
    if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
    const paths = buildFolderPaths(folders.map((folder) => ({
      id: folder._id, name: folder.name, slug: folder.slug || folderSlug(folder.name),
      parentFolderId: folder.parentFolderId ?? null,
    })));
    const result = serializeFile(file, request.nextUrl.origin, username,
      file.folderId ? paths.get(file.folderId) ?? [] : []);
    return NextResponse.json({ ok: true, id: result.id, fileName: result.fileName, url: result.url, publicUrl: result.publicUrl },
      { headers: { "Cache-Control": "private, no-store" } });
  }
  if (body && (body.folderId === null || (typeof body.folderId === "string" && /^[a-z0-9]{20,64}$/.test(body.folderId)))) {
    const moved = await convex.mutation(api.attachments.moveFileToFolder, {
      ownerKey, attachmentId: id as never, folderId: body.folderId as never,
    });
    if (!moved) return NextResponse.json({ error: "File or folder not found." }, { status: 404 });
    const [file, folders, username] = await Promise.all([
      convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: id as never }),
      convex.query(api.attachments.listFileFolders, { ownerKey }),
      getRouteAuthUsername(auth),
    ]);
    if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
    const paths = buildFolderPaths(folders.map((folder) => ({
      id: folder._id, name: folder.name, slug: folder.slug || folderSlug(folder.name),
      parentFolderId: folder.parentFolderId ?? null,
    })));
    const result = serializeFile(file, request.nextUrl.origin, username,
      file.folderId ? paths.get(file.folderId) ?? [] : []);
    return NextResponse.json({ ok: true, folderId: file.folderId ?? null, publicUrl: result.publicUrl },
      { headers: { "Cache-Control": "private, no-store" } });
  }
  if (body?.visibility !== "public" && body?.visibility !== "private") return NextResponse.json({ error: "Choose public or private." }, { status: 400 });
  const file = await convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: id as never });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  // Revoke old Convex raw URLs only after a verified R2 copy exists.
  if (body.visibility === "private") await migrateFileToR2(file);
  const ok = await convex.mutation(api.attachments.updateVisibility, { ownerKey, attachmentId: file._id, visibility: body.visibility });
  return NextResponse.json({ ok });
}
