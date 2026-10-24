import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  getRouteAuthUsername,
  unauthorizedJson,
  validateApiKeyPermission,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { buildAttachmentUrl } from "@/lib/attachment-url";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
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
  const details = await convex.query(api.attachments.getAttachmentDetails, {
    ownerKey,
    attachmentId: attachmentId as never,
  });
  if (!details) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const username = await getRouteAuthUsername(auth);
  if (username) {
    return NextResponse.json({
      url: buildAttachmentUrl(
        request.nextUrl.origin,
        username,
        attachmentId,
        details.fileName,
      ),
    });
  }

  const url = await convex.query(api.attachments.getAttachmentUrl, {
    ownerKey,
    attachmentId: attachmentId as never,
  });

  if (!url) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  return NextResponse.json({ url });
}
