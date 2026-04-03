import { NextRequest, NextResponse } from "next/server";

import { getRouteSession, unauthorizedJson } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";

function getKeyId(params: { keyId: string }) {
  const keyId = params.keyId?.trim();
  if (!keyId || keyId.length > 96) {
    return null;
  }

  return keyId;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const session = await getRouteSession(request);
  if (!session) {
    return unauthorizedJson();
  }

  const resolvedParams = await params;
  const keyId = getKeyId(resolvedParams);
  if (!keyId) {
    return NextResponse.json({ error: "Invalid key id." }, { status: 400 });
  }

  await convex.mutation(api.apiKeys.revoke, {
    keyId: keyId as never,
  });

  return NextResponse.json({ ok: true });
}

