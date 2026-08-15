import { NextRequest, NextResponse } from "next/server";

import {
  BROWSER_API_KEY_COOKIE_NAME,
  browserApiKeySessionCookieOptions,
  resolveApiKey,
  sealBrowserApiKeySession,
  validateUnsafeRequestOrigin,
} from "@/lib/auth-server";
import { apiKeyCanCreateBrowserSession } from "@/lib/api-key-browser-session";

const MAX_API_KEY_LENGTH = 256;

export async function POST(request: NextRequest) {
  const originError = validateUnsafeRequestOrigin(request);
  if (originError) {
    return originError;
  }

  const payload = (await request.json().catch(() => null)) as
    | { apiKey?: unknown }
    | null;
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";

  if (
    apiKey.length === 0 ||
    apiKey.length > MAX_API_KEY_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const resolvedApiKey = await resolveApiKey(apiKey);
  if (!resolvedApiKey || !apiKeyCanCreateBrowserSession(resolvedApiKey)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const sealedSession = sealBrowserApiKeySession(apiKey);
  if (!sealedSession) {
    return NextResponse.json(
      { error: "Browser API-key sign-in is not configured." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    key: {
      id: resolvedApiKey.id,
      name: resolvedApiKey.name,
      prefix: resolvedApiKey.prefix,
      last4: resolvedApiKey.last4,
      permission: resolvedApiKey.permission,
    },
  });
  response.cookies.set({
    name: BROWSER_API_KEY_COOKIE_NAME,
    value: sealedSession,
    ...browserApiKeySessionCookieOptions(),
  });

  return response;
}
