import { NextRequest, NextResponse } from "next/server";

import { getRouteAuth } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const auth = await getRouteAuth(request);
  if (!auth) {
    return NextResponse.json({ authenticated: false, expiresAt: null });
  }

  if (auth.type === "apiKey") {
    return NextResponse.json({
      authenticated: true,
      authType: "apiKey",
      permission: auth.apiKey.permission,
      expiresAt: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    authType: "session",
    expiresAt: auth.session.expiresAt,
  });
}
