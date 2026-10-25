import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { api, convex } from "@/lib/convex-server";
import { buildAttachmentUrl } from "@/lib/attachment-url";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username) || (cursor && cursor.length > 4_000)) {
    return NextResponse.json({ error: "Invalid username or cursor." }, { status: 400 });
  }

  const { data: users } = await (await clerkClient()).users.getUserList({ username: [username], limit: 1 });
  const owner = users.find((user) => user.username === username);
  if (!owner) return NextResponse.json({ error: "Public files not found." }, { status: 404 });

  const result = await convex.query(api.attachments.paginatePublicFiles, {
    ownerKey: `clerk:${owner.id}`,
    paginationOpts: { numItems: 50, cursor },
  });
  const files = result.page.map((file) => ({
    id: file._id,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.size,
    folderPath: file.folderPath,
    url: buildAttachmentUrl(request.nextUrl.origin, username, file._id, file.fileName, file.folderPath),
  }));

  return NextResponse.json({ files, cursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
