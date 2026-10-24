import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { api, convex } from "@/lib/convex-server";

function isPathSegment(value: string) {
  return value.length > 0 && value.length <= 180 && !/[\\/\u0000-\u001f\u007f]/.test(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; fileName: string }> },
) {
  const { username, fileName } = await params;
  if (!isPathSegment(username) || !isPathSegment(fileName)) {
    return NextResponse.json({ error: "Invalid attachment path." }, { status: 400 });
  }

  // Public downloads resolve the URL's owner, never the viewer's session.
  const { data: users } = await (await clerkClient()).users.getUserList({
    username: [username],
    limit: 1,
  });
  const owner = users.find((user) => user.username === username);
  if (!owner) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const url = await convex.query(api.attachments.getAttachmentUrlByOwnerAndFileName, {
    ownerKey: `clerk:${owner.id}`,
    fileName,
  });
  if (!url) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const storageHeaders = new Headers();
  for (const name of ["range", "if-range"]) {
    const value = request.headers.get(name);
    if (value) storageHeaders.set(name, value);
  }
  const storageResponse = await fetch(url, { cache: "no-store", headers: storageHeaders });
  if (!storageResponse.ok && storageResponse.status !== 416) {
    return NextResponse.json(
      { error: "Attachment file could not be loaded." },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Disposition": "inline",
    "Content-Type":
      storageResponse.headers.get("content-type") ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "X-Robots-Tag": "noindex, nofollow",
  });
  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = storageResponse.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(storageResponse.body, { status: storageResponse.status, headers });
}
