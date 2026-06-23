import { NextRequest, NextResponse } from "next/server";

import {
  getRouteAuth,
  getRouteAuthOwnerKey,
  unauthorizedJson,
  validateCsrfForSessionAuth,
} from "@/lib/auth-server";
import {
  CLI_AUTH_CODE_TTL_MS,
  createCliAuthCode,
  hashCliAuthValue,
  normalizeCliAuthParam,
  normalizeCliRedirectUri,
} from "@/lib/cli-auth";
import { api, convex } from "@/lib/convex-server";

export async function POST(request: NextRequest) {
  const auth = await getRouteAuth(request, {
    allowApiKey: false,
    allowSession: false,
  });
  if (!auth) {
    return unauthorizedJson();
  }
  const csrfError = validateCsrfForSessionAuth(request, auth);
  if (csrfError) {
    return csrfError;
  }

  const form = await request.formData().catch(() => null);
  const redirectUri = normalizeCliRedirectUri(form?.get("redirect_uri"));
  const state = normalizeCliAuthParam(form?.get("state"));
  const codeChallenge = normalizeCliAuthParam(form?.get("code_challenge"));

  if (!redirectUri || !state || !codeChallenge) {
    return NextResponse.json({ error: "Invalid CLI auth request." }, { status: 400 });
  }

  const code = createCliAuthCode();
  await convex.mutation(api.cliAuth.createCode, {
    ownerKey: getRouteAuthOwnerKey(auth),
    codeHash: hashCliAuthValue(code),
    codeChallenge,
    redirectUri,
    state,
    expiresAt: Date.now() + CLI_AUTH_CODE_TTL_MS,
  });

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", state);
  return NextResponse.redirect(callbackUrl);
}
