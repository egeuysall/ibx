import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { uploadMetadataSchema } from "@/lib/file-upload-token";
import { confirmR2Upload, r2Configured } from "@/lib/r2-storage";
import { migrateFileToR2, serializeFile } from "@/lib/files-server";
import { buildFolderPaths, folderSlug } from "@/lib/file-folders";

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const all = request.nextUrl.searchParams.get("all") === "true";
  const kind = request.nextUrl.searchParams.get("parentKind");
  const parentKind = kind === "todo" || kind === "thought" || kind === "file" ? kind : null;
  const parentId = request.nextUrl.searchParams.get("parentId")?.trim();
  if (!all && (!parentKind || !parentId || parentId.length > 128)) {
    return NextResponse.json({ error: "parentKind and parentId are required unless all=true." }, { status: 400 });
  }
  const ownerKey = getRouteAuthOwnerKey(auth);
  const [attachments, username, folders] = await Promise.all([
    all ? convex.query(api.attachments.listAllAttachments, { ownerKey, limit: 100 })
      : convex.query(api.attachments.listAttachments, { ownerKey, parentKind: parentKind!, parentId: parentId!, limit: 50 }),
    getRouteAuthUsername(auth),
    convex.query(api.attachments.listFileFolders, { ownerKey }),
  ]);
  const paths = buildFolderPaths(folders.map((folder) => ({
    id: folder._id, name: folder.name, slug: folder.slug || folderSlug(folder.name),
    parentFolderId: folder.parentFolderId ?? null,
  })));
  return NextResponse.json({ attachments: attachments.map((file) => serializeFile(file, request.nextUrl.origin, username,
    file.folderId ? paths.get(file.folderId) ?? [] : [])) },
    { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateCsrfForSessionAuth(request, auth) ?? validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const ownerKey = getRouteAuthOwnerKey(auth);
  let created: { id: string; fileName: string };
  if (body?.uploadToken !== undefined) {
    try {
      const { r2Key, parentKind, parentId, fileName, contentType, size } = await confirmR2Upload(body.uploadToken, ownerKey);
      created = await convex.mutation(api.attachments.createR2Attachment, { ownerKey, r2Key, parentKind, parentId, fileName, contentType, size });
    } catch {
      return NextResponse.json({ error: "Upload ticket expired, invalid, or uploaded bytes do not match." }, { status: 400 });
    }
  } else {
    const metadata = uploadMetadataSchema.safeParse(body);
    if (!metadata.success || typeof body?.storageId !== "string" || !/^[a-z0-9]{20,64}$/.test(body.storageId)) {
      return NextResponse.json({ error: "Invalid attachment metadata." }, { status: 400 });
    }
    try {
      created = await convex.mutation(api.attachments.createAttachment, { ownerKey, ...metadata.data, storageId: body.storageId as never });
    } catch {
      return NextResponse.json({ error: "Attachment metadata rejected." }, { status: 400 });
    }
    if (r2Configured()) {
      const file = await convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: created.id as never });
      if (file) await migrateFileToR2(file).catch(() => {
        // Preserve uploaded bytes if copying fails; migration can safely retry.
        console.warn("Legacy upload retained in Convex; R2 copy pending.");
      });
    }
  }
  const [file, username, folders] = await Promise.all([
    convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: created.id as never }),
    getRouteAuthUsername(auth),
    convex.query(api.attachments.listFileFolders, { ownerKey }),
  ]);
  if (!file) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const paths = buildFolderPaths(folders.map((folder) => ({
    id: folder._id, name: folder.name, slug: folder.slug || folderSlug(folder.name),
    parentFolderId: folder.parentFolderId ?? null,
  })));
  const result = serializeFile(file, request.nextUrl.origin, username,
    file.folderId ? paths.get(file.folderId) ?? [] : []);
  return NextResponse.json({ ok: true, id: result.id, fileName: result.fileName, url: result.url, publicUrl: result.publicUrl, visibility: result.visibility },
    { headers: { "Cache-Control": "private, no-store" } });
}
