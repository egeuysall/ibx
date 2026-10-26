import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { uploadMetadataSchema } from "@/lib/file-upload-token";
import { createR2Upload } from "@/lib/r2-storage";

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, auth);
  if (csrfError) {
    return csrfError;
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const body = await request.json().catch(() => null);
  if (body && Object.keys(body).length > 0) {
    const metadata = uploadMetadataSchema.safeParse(body);
    if (!metadata.success) return NextResponse.json({ error: "Invalid file metadata, unsupported type, or file exceeds its upload size limit." }, { status: 400 });
    const { directory, folderId: requestedFolderId, ...input } = metadata.data;
    let folderId = requestedFolderId;
    if (directory) {
      const path = directory.trim().replace(/^\/+|\/+$/g, "").split("/");
      if (path.length > 20 || path.some((part) => !part || part.length > 64 || part === "." || part === ".." || /[\\\u0000-\u001f\u007f]/.test(part))) {
        return NextResponse.json({ error: "Folder path contains an invalid name." }, { status: 400 });
      }
      try {
        const ensuredFolderId = await convex.mutation(api.attachments.ensureFileFolderPath, { ownerKey, path });
        if (!ensuredFolderId) return NextResponse.json({ error: "Could not create attachment directory." }, { status: 400 });
        folderId = ensuredFolderId;
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create attachment directory." }, { status: 400 });
      }
    }
    if (folderId && !directory) {
      const folders = await convex.query(api.attachments.listFileFolders, { ownerKey });
      if (!folders.some((folder) => folder._id === folderId)) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }
    if (input.parentKind !== "file") {
      const parent = input.parentKind === "todo"
        ? await convex.query(api.todos.getByStringId, { ownerKey, todoId: input.parentId })
        : await convex.query(api.thoughts.getByExternalId, { ownerKey, externalId: input.parentId });
      if (!parent) return NextResponse.json({ error: "Attachment parent not found." }, { status: 404 });
    }
    const signed = await createR2Upload({ ...input, ...(folderId ? { folderId: folderId as never } : {}), ownerKey });
    const limits = await convex.query(api.attachments.limits, {});
    if (input.parentKind === "file") limits.maxBytes = 500 * 1024 * 1024;
    return NextResponse.json({ ...signed, limits }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // Older CLI/iOS builds still upload via Convex; completion copies their bytes to R2.
  const uploadUrl = await convex.mutation(api.attachments.generateUploadUrl, {
    ownerKey,
  });
  const limits = await convex.query(api.attachments.limits, {});

  return NextResponse.json({ uploadUrl, limits });
}
