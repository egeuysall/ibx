import { NextRequest, NextResponse } from "next/server";

import { createApiKey } from "@/lib/api-keys";
import {
  hashCliAuthValue,
  normalizeCliAuthParam,
  normalizeCliRedirectUri,
} from "@/lib/cli-auth";
import { api, convex } from "@/lib/convex-server";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    codeVerifier?: unknown;
    redirectUri?: unknown;
  } | null;
  const code = normalizeCliAuthParam(body?.code);
  const codeVerifier = normalizeCliAuthParam(body?.codeVerifier);
  const redirectUri = normalizeCliRedirectUri(body?.redirectUri);

  if (!code || !codeVerifier || !redirectUri) {
    return NextResponse.json({ error: "Invalid CLI auth token request." }, { status: 400 });
  }

  const { rawKey, keyHash, last4, prefix } = createApiKey();
  const result = await convex.mutation(api.cliAuth.consumeCodeAndCreateApiKey, {
    codeHash: hashCliAuthValue(code),
    codeChallenge: hashCliAuthValue(codeVerifier),
    redirectUri,
    keyHash,
    prefix,
    last4,
    name: "cli browser login",
    permission: "both",
  });

  if (!result) {
    return NextResponse.json(
      { error: "CLI auth code expired or invalid." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    apiKey: rawKey,
    authType: "clerk-browser",
    permission: "both",
  });
}
