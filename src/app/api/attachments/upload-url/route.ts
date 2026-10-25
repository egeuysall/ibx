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
    if (!metadata.success) return NextResponse.json({ error: "Invalid file metadata, unsupported type, or file exceeds 30 MB." }, { status: 400 });
    const input = metadata.data;
    if (input.parentKind !== "file") {
      const parent = input.parentKind === "todo"
        ? await convex.query(api.todos.getByStringId, { ownerKey, todoId: input.parentId })
        : await convex.query(api.thoughts.getByExternalId, { ownerKey, externalId: input.parentId });
      if (!parent) return NextResponse.json({ error: "Attachment parent not found." }, { status: 404 });
    }
    const signed = await createR2Upload({ ...input, ownerKey });
    const limits = await convex.query(api.attachments.limits, {});
    return NextResponse.json({ ...signed, limits }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // Older CLI/iOS builds still upload via Convex; completion copies their bytes to R2.
  const uploadUrl = await convex.mutation(api.attachments.generateUploadUrl, {
    ownerKey,
  });
  const limits = await convex.query(api.attachments.limits, {});

  return NextResponse.json({ uploadUrl, limits });
}
