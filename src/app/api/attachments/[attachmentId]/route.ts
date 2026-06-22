import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

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
  if (!attachmentId || attachmentId.length > 128) {
    return NextResponse.json({ error: "Invalid attachment id." }, { status: 400 });
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const ok = await convex.mutation(api.attachments.deleteAttachment, {
    ownerKey,
    attachmentId: attachmentId as never,
  });

  if (!ok) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
