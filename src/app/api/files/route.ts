import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission, validateCsrfForSessionAuth } from "@/lib/auth-server";
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
    const [result, folders, username] = await Promise.all([
      convex.query(api.attachments.paginateFiles, { ownerKey: getRouteAuthOwnerKey(auth), paginationOpts: { numItems: 50, cursor } }),
      convex.query(api.attachments.listFileFolders, { ownerKey: getRouteAuthOwnerKey(auth) }),
      getRouteAuthUsername(auth),
    ]);
    return NextResponse.json({
      files: result.page.map((file) => serializeFile(file, request.nextUrl.origin, username)),
      folders: folders.map(({ _id, name }) => ({ id: _id, name })),
      cursor: result.isDone ? null : result.continueCursor, isDone: result.isDone, username,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (cursor) return NextResponse.json({ error: "Invalid file-list cursor." }, { status: 400 });
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateCsrfForSessionAuth(request, auth) ?? validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (typeof body?.name !== "string" || body.name.length > 64) {
    return NextResponse.json({ error: "Folder names must be 1–64 characters." }, { status: 400 });
  }
  try {
    const id = await convex.mutation(api.attachments.createFileFolder, { ownerKey: getRouteAuthOwnerKey(auth), name: body.name });
    return NextResponse.json({ folder: { id, name: body.name.trim() } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create folder." }, { status: 400 });
  }
}
