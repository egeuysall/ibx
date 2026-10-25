import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { api, convex } from "@/lib/convex-server";
import { streamStoredFile } from "@/lib/files-server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string; fileName: string }> }) {
  const { username, fileName } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username) || !fileName || fileName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const { data: users } = await (await clerkClient()).users.getUserList({ username: [username], limit: 1 });
  const owner = users.find((user) => user.username === username);
  if (!owner) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const file = await convex.query(api.attachments.getPublicAttachment, { ownerKey: `clerk:${owner.id}`, fileName });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return streamStoredFile(file, request, true);
}
