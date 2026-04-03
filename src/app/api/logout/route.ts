import { NextRequest, NextResponse } from "next/server";

import { getRouteSession, validateCsrfForSessionAuth } from "@/lib/auth-server";
import { api, convex } from "@/lib/convex-server";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  hashSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getRouteSession(request);
  if (session) {
    const csrfError = validateCsrfForSessionAuth(request, { type: "session", session });
    if (csrfError) {
      return csrfError;
    }
  }

  const tokens = [
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    request.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value,
  ].filter((value): value is string => Boolean(value));

  for (const token of tokens) {
    await convex.mutation(api.sessions.remove, {
      tokenHash: hashSessionToken(token),
    });
  }

  const response = NextResponse.json({ ok: true });
  for (const cookieName of [SESSION_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME]) {
    response.cookies.set({
      name: cookieName,
      value: "",
      ...sessionCookieOptions(),
      maxAge: 0,
    });
  }

  return response;
}
