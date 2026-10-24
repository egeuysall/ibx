import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

function isPathSegment(value: string) {
  return value.length > 0 && value.length <= 180 && !/[\\/\u0000-\u001f\u007f]/.test(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; fileName: string }> },
) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const { username, fileName } = await params;
  if (!isPathSegment(username) || !isPathSegment(fileName)) {
    return NextResponse.json({ error: "Invalid attachment path." }, { status: 400 });
  }

  const url = await convex.query(api.attachments.getAttachmentUrlByOwnerAndFileName, {
    ownerKey: getRouteAuthOwnerKey(auth),
    fileName,
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

  return new NextResponse(storageResponse.body, { status: 200, headers });
}
