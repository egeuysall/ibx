import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, getRouteAuthUsername, unauthorizedJson, validateApiKeyPermission } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { serializeFile } from "@/lib/files-server";
import { buildFolderPaths, folderSlug } from "@/lib/file-folders";

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const { attachmentId } = await params;
  if (!/^[a-z0-9]{20,64}$/.test(attachmentId)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const ownerKey = getRouteAuthOwnerKey(auth);
  const [file, username, folders] = await Promise.all([
    convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: attachmentId as never }),
    getRouteAuthUsername(auth),
    convex.query(api.attachments.listFileFolders, { ownerKey }),
  ]);
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const paths = buildFolderPaths(folders.map((folder) => ({
    id: folder._id, name: folder.name, slug: folder.slug || folderSlug(folder.name),
    parentFolderId: folder.parentFolderId ?? null,
  })));
  const result = serializeFile(file, request.nextUrl.origin, username,
    file.folderId ? paths.get(file.folderId) ?? [] : []);
  return NextResponse.json({ url: result.url, publicUrl: result.publicUrl, visibility: result.visibility }, { headers: { "Cache-Control": "private, no-store" } });
}
