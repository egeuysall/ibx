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
    return NextResponse.redirect(
      buildAttachmentUrl(
        request.nextUrl.origin,
        username,
        attachmentId,
        details.fileName,
      ),
      307,
    );
  }

  const url = await convex.query(api.attachments.getAttachmentUrl, {
    ownerKey,
    attachmentId: attachmentId as never,
  });

  if (!url) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const storageResponse = await fetch(url, { cache: "no-store" });
  if (!storageResponse.ok || !storageResponse.body) {
    return NextResponse.json(
      { error: "Attachment file could not be loaded." },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "Content-Type":
      storageResponse.headers.get("content-type") ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  const contentLength = storageResponse.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new NextResponse(storageResponse.body, {
    status: 200,
    headers,
  });
}
