import { NextRequest, NextResponse } from "next/server";

import { getRouteSession, unauthorizedJson, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { createApiKey } from "@/lib/api-keys";
import { api, convex } from "@/lib/convex-server";

type ApiKeyPermission = "read" | "write" | "both";

function normalizeKeyName(value: unknown) {
  if (typeof value !== "string") {
    return "default";
  }

  const normalized = value.trim().slice(0, 64);
  return normalized.length > 0 ? normalized : "default";
}

function normalizePermission(value: unknown): ApiKeyPermission {
  if (value === "read" || value === "write" || value === "both") {
    return value;
  }

  return "both";
}

export async function GET(request: NextRequest) {
  const session = await getRouteSession(request);
  if (!session) {
    return unauthorizedJson();
  }

  const keys = await convex.query(api.apiKeys.list, { includeRevoked: false });

  return NextResponse.json({
    keys: keys.map((key) => ({
      id: key._id,
      name: key.name,
      prefix: key.prefix,
      last4: key.last4,
      permission: key.permission ?? "both",
      createdAt: key.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getRouteSession(request);
  if (!session) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, { type: "session", session });
  if (csrfError) {
    return csrfError;
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    permission?: unknown;
  } | null;
  const name = normalizeKeyName(body?.name);
  const permission = normalizePermission(body?.permission);

  const { rawKey, keyHash, last4, prefix } = createApiKey();

  const keyId = await convex.mutation(api.apiKeys.create, {
    name,
    keyHash,
    prefix,
    last4,
    permission,
  });

  return NextResponse.json({
    ok: true,
    apiKey: rawKey,
    key: {
      id: keyId,
      name,
      prefix,
      last4,
      permission,
    },
  });
}
