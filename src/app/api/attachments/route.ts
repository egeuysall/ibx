import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

const MAX_FILE_NAME_LENGTH = 180;

function normalizeParentKind(input: string | null) {
  return input === "thought" || input === "todo" ? input : null;
}

function normalizeParentId(input: string | null | undefined) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value || value.length > 128) {
    return null;
  }

  return value;
}

function serializeAttachment(attachment: {
  _id: string;
  parentKind: "thought" | "todo";
  parentId: string;
  fileName: string;
  contentType: string;
  size: number;
  status: "uploaded" | "pendingDelete" | "deleted";
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: attachment._id,
    parentKind: attachment.parentKind,
    parentId: attachment.parentId,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    status: attachment.status,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const parentKind = normalizeParentKind(
    request.nextUrl.searchParams.get("parentKind"),
  );
  const parentId = normalizeParentId(request.nextUrl.searchParams.get("parentId"));
  if (!parentKind || !parentId) {
    return NextResponse.json(
      { error: "parentKind and parentId are required." },
      { status: 400 },
    );
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const attachments = await convex.query(api.attachments.listAttachments, {
    ownerKey,
    parentKind,
    parentId,
    limit: 50,
  });

  return NextResponse.json({
    attachments: attachments.map(serializeAttachment),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, auth);
  if (csrfError) {
    return csrfError;
  }
  const permissionError = validateApiKeyPermission(request, auth);
  if (permissionError) {
    return permissionError;
  }

  const body = (await request.json().catch(() => null)) as {
    parentKind?: unknown;
    parentId?: unknown;
    storageId?: unknown;
    fileName?: unknown;
    contentType?: unknown;
    size?: unknown;
  } | null;

  const parentKind =
    body?.parentKind === "thought" || body?.parentKind === "todo"
      ? body.parentKind
      : null;
  const parentId = normalizeParentId(
    typeof body?.parentId === "string" ? body.parentId : null,
  );
  const storageId =
    typeof body?.storageId === "string" && body.storageId.length <= 128
      ? body.storageId
      : null;
  const fileName =
    typeof body?.fileName === "string"
      ? body.fileName.trim().slice(0, MAX_FILE_NAME_LENGTH)
      : "";
  const contentType =
    typeof body?.contentType === "string" && body.contentType.length <= 120
      ? body.contentType
      : "";
  const size =
    typeof body?.size === "number" && Number.isFinite(body.size)
      ? body.size
      : null;

  if (!parentKind || !parentId || !storageId || !fileName || !contentType || !size) {
    return NextResponse.json(
      { error: "Invalid attachment metadata." },
      { status: 400 },
    );
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  let attachmentId: string;
  try {
    attachmentId = await convex.mutation(api.attachments.createAttachment, {
      ownerKey,
      parentKind,
      parentId,
      storageId: storageId as never,
      fileName,
      contentType,
      size,
    });
  } catch {
    return NextResponse.json(
      { error: "Attachment metadata rejected." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, id: attachmentId });
}
