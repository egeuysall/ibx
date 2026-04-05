import "server-only";

import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { api, convex } from "@/lib/convex-server";
import { API_KEY_PREFIX } from "@/lib/api-keys";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  hashSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

export type SessionCheck = {
  token: string;
  tokenHash: string;
  expiresAt: number;
};

export type ApiKeyCheck = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  permission: "read" | "write" | "both";
  createdAt: number;
};

export type RouteAuth =
  | {
      type: "session";
      session: SessionCheck;
    }
  | {
      type: "apiKey";
      apiKey: ApiKeyCheck;
    };

type RouteAuthOptions = {
  allowSession?: boolean;
  allowApiKey?: boolean;
};
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readSessionTokenFromCookieStore(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (currentToken) {
    return currentToken;
  }

  return cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value ?? null;
}

function readSessionTokenFromRequest(request: NextRequest) {
  const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (currentToken) {
    return currentToken;
  }

  return request.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value ?? null;
}

async function resolveSession(token: string) {
  const tokenHash = hashSessionToken(token);
  const session = await convex.query(api.sessions.getValid, { tokenHash });

  if (!session) {
    return null;
  }

  return {
    token,
    tokenHash,
    expiresAt: session.expiresAt,
  } satisfies SessionCheck;
}

function parseBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

async function resolveApiKey(rawKey: string) {
  if (!rawKey.startsWith(API_KEY_PREFIX) || rawKey.length <= API_KEY_PREFIX.length) {
    return null;
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const key = await convex.query(api.apiKeys.getActiveByHash, { keyHash });

  if (!key) {
    return null;
  }

  return {
    id: key._id,
    name: key.name,
    prefix: key.prefix,
    last4: key.last4,
    permission: key.permission ?? "both",
    createdAt: key.createdAt,
  } satisfies ApiKeyCheck;
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const token = readSessionTokenFromCookieStore(cookieStore);

  if (!token) {
    return null;
  }

  return resolveSession(token);
}

export async function getRouteSession(request: NextRequest) {
  const token = readSessionTokenFromRequest(request);

  if (!token) {
    return null;
  }

  return resolveSession(token);
}

export async function getRouteAuth(
  request: NextRequest,
  options: RouteAuthOptions = {},
): Promise<RouteAuth | null> {
  const allowApiKey = options.allowApiKey ?? true;
  const allowSession = options.allowSession ?? true;

  if (allowApiKey) {
    const bearerToken = parseBearerToken(request);
    if (bearerToken) {
      const apiKey = await resolveApiKey(bearerToken);
      if (!apiKey) {
        return null;
      }

      return {
        type: "apiKey",
        apiKey,
      };
    }
  }

  if (!allowSession) {
    return null;
  }

  const session = await getRouteSession(request);
  if (!session) {
    return null;
  }

  return {
    type: "session",
    session,
  };
}

function getRequestOriginBase(request: NextRequest) {
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!hostHeader) {
    return null;
  }

  const protocolHeader = request.headers.get("x-forwarded-proto");
  const protocol = protocolHeader?.split(",")[0]?.trim() || (process.env.NODE_ENV === "production" ? "https" : "http");

  if (protocol !== "http" && protocol !== "https") {
    return null;
  }

  return `${protocol}://${hostHeader.trim()}`;
}

function sameOrigin(candidate: string, requestOrigin: string) {
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.host}` === requestOrigin;
  } catch {
    return false;
  }
}

export function validateCsrfForSessionAuth(request: NextRequest, auth: RouteAuth) {
  if (auth.type !== "session" || SAFE_METHODS.has(request.method)) {
    return null;
  }

  const requestOrigin = getRequestOriginBase(request);
  if (!requestOrigin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  if (originHeader && sameOrigin(originHeader, requestOrigin)) {
    return null;
  }

  if (!originHeader && refererHeader && sameOrigin(refererHeader, requestOrigin)) {
    return null;
  }

  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

export function validateApiKeyPermission(request: NextRequest, auth: RouteAuth) {
  if (auth.type !== "apiKey") {
    return null;
  }

  if (auth.apiKey.permission === "both") {
    return null;
  }

  const isSafeMethod = SAFE_METHODS.has(request.method);
  if (auth.apiKey.permission === "read" && isSafeMethod) {
    return null;
  }

  if (auth.apiKey.permission === "write" && !isSafeMethod) {
    return null;
  }

  const operationType = isSafeMethod ? "read" : "write";
  return NextResponse.json(
    {
      error: `API key does not allow ${operationType} operations.`,
    },
    { status: 403 },
  );
}

export function unauthorizedJson(message = "Unauthorized") {
  const response = NextResponse.json({ error: message }, { status: 401 });
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
