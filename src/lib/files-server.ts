import "server-only";
import { randomUUID } from "node:crypto";
import { api, convex } from "./convex-server";
import type { Doc } from "../../convex/_generated/dataModel";
import { buildAttachmentUrl } from "./attachment-url";
import { resolveFileVisibility } from "./file-visibility";
import { copyBytesToR2, deleteR2Object, r2DownloadUrl } from "./r2-storage";
import { ownerStoragePrefix } from "./file-upload-token";

export function serializeFile(file: Doc<"attachments">, origin: string, username: string | null, folderPath: string[] = []) {
  const visibility = resolveFileVisibility(file.visibility);
  const publicUrl = visibility === "public" && username
    ? buildAttachmentUrl(origin, username, file._id, file.fileName, folderPath) : null;
  return {
    id: file._id, parentKind: file.parentKind, parentId: file.parentId,
    ...(file.folderId ? { folderId: file.folderId } : {}),
    fileName: file.fileName, contentType: file.contentType, size: file.size,
    status: file.status, visibility, createdAt: file.createdAt, updatedAt: file.updatedAt,
    storageProvider: file.storageProvider ?? "convex",
    url: publicUrl ?? `${origin}/api/attachments/${file._id}/file`, publicUrl,
  };
}

export async function storedFileUrl(file: Doc<"attachments">) {
  if (file.r2Key && file.storageProvider === "r2") return r2DownloadUrl(file.r2Key);
  return convex.query(api.attachments.getAttachmentUrl, {
    ownerKey: file.ownerKey ?? null, attachmentId: file._id,
  });
}

export async function streamStoredFile(file: Doc<"attachments">, request: Request, publicAccess: boolean) {
  const url = await storedFileUrl(file);
  if (!url) return Response.json({ error: "File not found." }, { status: 404 });
  const upstreamHeaders = new Headers({ "Accept-Encoding": "identity" });
  for (const name of ["range", "if-range"]) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }
  const upstream = await fetch(url, { headers: upstreamHeaders, cache: "no-store" });
  if (!upstream.ok && upstream.status !== 416) return Response.json({ error: "File could not be loaded." }, { status: 502 });
  const headers = new Headers({
    "Content-Type": file.contentType, "Content-Disposition": "inline",
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (file.contentType === "image/svg+xml") {
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }
  if (publicAccess) headers.set("Access-Control-Allow-Origin", "*");
  for (const name of ["content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Do not forward the compressed upstream length after fetch decompresses bytes.
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function migrateFileToR2(file: Doc<"attachments">) {
  if (file.storageProvider === "r2" && file.r2Key) return file;
  const sourceUrl = await storedFileUrl(file);
  if (!sourceUrl) throw new Error("Original file not found; nothing was changed.");
  const response = await fetch(sourceUrl, { cache: "no-store", headers: { "Accept-Encoding": "identity" } });
  if (!response.ok) throw new Error("Could not read the original file; nothing was changed.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("Original file size mismatch; nothing was changed.");
  const r2Key = `${ownerStoragePrefix(file.ownerKey ?? null)}${randomUUID()}`;
  await copyBytesToR2(r2Key, bytes, file.contentType);
  try {
    await convex.mutation(api.attachments.markR2Migrated, { ownerKey: file.ownerKey ?? null, attachmentId: file._id, r2Key });
  } catch (error) {
    await deleteR2Object(r2Key).catch(() => undefined);
    throw error;
  }
  return { ...file, r2Key, storageProvider: "r2" as const };
}

export async function deleteStoredFile(file: Doc<"attachments">) {
  if (file.r2Key) await deleteR2Object(file.r2Key);
  return convex.mutation(api.attachments.deleteAttachment, { ownerKey: file.ownerKey ?? null, attachmentId: file._id });
}
