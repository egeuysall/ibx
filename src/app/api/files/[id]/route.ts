import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, getRouteAuthOwnerKey, unauthorizedJson, validateApiKeyPermission, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import { migrateFileToR2 } from "@/lib/files-server";
import { DELETE as deleteAttachment } from "../../attachments/[attachmentId]/route";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteAttachment(request, { params: Promise.resolve({ attachmentId: id }) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRouteAuth(request);
  if (!auth) return unauthorizedJson();
  const denied = validateCsrfForSessionAuth(request, auth) ?? validateApiKeyPermission(request, auth);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-z0-9]{20,64}$/.test(id)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const ownerKey = getRouteAuthOwnerKey(auth);
  if (body && (body.folderId === null || (typeof body.folderId === "string" && /^[a-z0-9]{20,64}$/.test(body.folderId)))) {
    const moved = await convex.mutation(api.attachments.moveFileToFolder, {
      ownerKey, attachmentId: id as never, folderId: body.folderId as never,
    });
    if (!moved) return NextResponse.json({ error: "File or folder not found." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (body?.visibility !== "public" && body?.visibility !== "private") return NextResponse.json({ error: "Choose public or private." }, { status: 400 });
  const file = await convex.query(api.attachments.getAttachmentDetails, { ownerKey, attachmentId: id as never });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });
  // Revoke old Convex raw URLs only after a verified R2 copy exists.
  if (body.visibility === "private") await migrateFileToR2(file);
  const ok = await convex.mutation(api.attachments.updateVisibility, { ownerKey, attachmentId: file._id, visibility: body.visibility });
  return NextResponse.json({ ok });
}
