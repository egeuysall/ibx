import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { deleteStoredFile } from "@/lib/files-server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
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

  const resolvedParams = await params;
  const attachmentId = resolvedParams.attachmentId?.trim();
  if (!attachmentId || !/^[a-z0-9]{20,64}$/.test(attachmentId)) {
    return NextResponse.json({ error: "Invalid attachment id." }, { status: 400 });
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const file = await convex.query(api.attachments.getAttachmentDetails, {
    ownerKey,
    attachmentId: attachmentId as never,
  });

  if (!file) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const ok = await deleteStoredFile(file);
  return NextResponse.json({ ok });
}
