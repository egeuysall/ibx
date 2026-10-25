import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { serializeFile } from "@/lib/files-server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const { attachmentId } = await params;
  if (!/^[a-z0-9]{20,64}$/.test(attachmentId)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const file = await convex.query(api.attachments.getAttachmentDetails, { ownerKey: getRouteAuthOwnerKey(auth), attachmentId: attachmentId as never });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const result = serializeFile(file, request.nextUrl.origin, await getRouteAuthUsername(auth));
  return NextResponse.json({ url: result.url, publicUrl: result.publicUrl, visibility: result.visibility }, { headers: { "Cache-Control": "private, no-store" } });
}
