import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateApiKeyPermission,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import {
  canEncryptBriConnections,
  describeBriApiKey,
  encryptBriApiKey,
  normalizeBriApiKey,
  readConvexServerSecret,
  readBriBaseUrl,
  verifyBriApiKey,
} from "@/lib/bri-connection";
import { api, convex } from "@/lib/convex-server";

function serializeConnection(connection: {
  _id: string;
  keyPrefix: string;
  keyLast4: string;
  createdAt: number;
  updatedAt: number;
  verifiedAt: number;
  lastError: string | null;
}) {
  return {
    id: connection._id,
    keyPrefix: connection.keyPrefix,
    keyLast4: connection.keyLast4,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    verifiedAt: connection.verifiedAt,
    lastError: connection.lastError,
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

  const ownerKey = getRouteAuthOwnerKey(auth);
  const serverSecret = readConvexServerSecret();
  const connection = serverSecret
    ? await convex.query(api.briConnections.get, { ownerKey, serverSecret })
    : null;

  return NextResponse.json({
    connection: connection ? serializeConnection(connection) : null,
    configured: Boolean(connection),
    encryptionReady: canEncryptBriConnections() && Boolean(serverSecret),
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
    apiKey?: unknown;
  } | null;
  const apiKey = normalizeBriApiKey(body?.apiKey);
  if (!apiKey) {
    return NextResponse.json({ error: "Invalid Bri API key." }, { status: 400 });
  }

  const baseUrl = readBriBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Bri base URL is not configured." },
      { status: 503 },
    );
  }

  const encrypted = encryptBriApiKey(apiKey);
  const serverSecret = readConvexServerSecret();
  if (!encrypted || !serverSecret) {
    return NextResponse.json(
      { error: "Bri key encryption is not configured." },
      { status: 503 },
    );
  }

  try {
    await verifyBriApiKey(apiKey, baseUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bri API key verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const ownerKey = getRouteAuthOwnerKey(auth);
  const { keyPrefix, keyLast4 } = describeBriApiKey(apiKey);
  await convex.mutation(api.briConnections.upsert, {
    serverSecret,
    ownerKey,
    ...encrypted,
    keyPrefix,
    keyLast4,
    verifiedAt: Date.now(),
  });

  const connection = await convex.query(api.briConnections.get, {
    ownerKey,
    serverSecret,
  });
  if (!connection) {
    return NextResponse.json(
      { error: "Bri connection was not saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    connection: serializeConnection(connection),
  });
}

export async function DELETE(request: NextRequest) {
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

  const ownerKey = getRouteAuthOwnerKey(auth);
  const serverSecret = readConvexServerSecret();
  if (!serverSecret) {
    return NextResponse.json(
      { error: "Bri key encryption is not configured." },
      { status: 503 },
    );
  }

  await convex.mutation(api.briConnections.remove, { ownerKey, serverSecret });
  return NextResponse.json({ ok: true });
}
