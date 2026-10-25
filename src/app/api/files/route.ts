import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { serializeFile } from "@/lib/files-server";

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor && cursor.length > 4_000) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  try {
    const [result, username] = await Promise.all([
      convex.query(api.attachments.paginateFiles, { ownerKey: getRouteAuthOwnerKey(auth), paginationOpts: { numItems: 50, cursor } }),
      getRouteAuthUsername(auth),
    ]);
    return NextResponse.json({
      files: result.page.map((file) => serializeFile(file, request.nextUrl.origin, username)),
      cursor: result.isDone ? null : result.continueCursor, isDone: result.isDone, username,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (cursor) return NextResponse.json({ error: "Invalid file-list cursor." }, { status: 400 });
    throw error;
  }
}
