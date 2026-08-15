import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { verifyToken } from "@clerk/backend";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { api, convex } from "@/lib/convex-server";
import { API_KEY_PREFIX } from "@/lib/api-keys";
import { apiKeyCanCreateBrowserSession } from "@/lib/api-key-browser-session";
import { getAuthOwnerKey } from "@/lib/auth-owner";
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
  ownerKey: string | null;
  createdAt: number;
};

export type RouteAuth =
  | {
      type: "clerk";
      userId: string;
      ownerKey: string;
      tokenSource: "bearer" | "cookie";
    }
  | {
      type: "session";
      session: SessionCheck;
    }
  | {
      type: "apiKey";
      apiKey: ApiKeyCheck;
      tokenSource: "bearer" | "cookie";
    };

type RouteAuthOptions = {
  allowSession?: boolean;
  allowApiKey?: boolean;
  allowBrowserApiKey?: boolean;
  allowClerk?: boolean;
};
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const BROWSER_API_KEY_COOKIE_NAME = "ibx_api_key_session";
export const BROWSER_API_KEY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const BROWSER_API_KEY_SESSION_VERSION = 1;
const BROWSER_API_KEY_SECRET_MIN_LENGTH = 32;

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

export async function resolveApiKey(rawKey: string) {
  if (!rawKey.startsWith(API_KEY_PREFIX) || rawKey.length <= API_KEY_PREFIX.length) {
    return null;
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  return resolveApiKeyHash(keyHash);
}

async function resolveApiKeyHash(keyHash: string) {
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
    ownerKey: key.ownerKey ?? null,
    createdAt: key.createdAt,
  } satisfies ApiKeyCheck;
}

function getBrowserApiKeySessionSecret() {
  const secret = process.env.API_KEY_SESSION_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret || secret.length < BROWSER_API_KEY_SECRET_MIN_LENGTH) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
}

function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function browserApiKeySessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BROWSER_API_KEY_SESSION_MAX_AGE_SECONDS,
  };
}

export function sealBrowserApiKeySession(rawKey: string) {
  const key = getBrowserApiKeySessionSecret();
  if (!key) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.from(
    JSON.stringify({
      v: BROWSER_API_KEY_SESSION_VERSION,
      keyHash: hashApiKey(rawKey),
      exp: Date.now() + BROWSER_API_KEY_SESSION_MAX_AGE_SECONDS * 1000,
    }),
  );
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

async function resolveBrowserApiKeySession(sealedSession: string) {
  const key = getBrowserApiKeySessionSecret();
  if (!key) {
    return null;
  }

  try {
    const sealed = Buffer.from(sealedSession, "base64url");
    if (sealed.length <= 28) {
      return null;
    }

    const iv = sealed.subarray(0, 12);
    const tag = sealed.subarray(12, 28);
    const encrypted = sealed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"),
    ) as { v?: unknown; keyHash?: unknown; exp?: unknown };

    if (
      payload.v !== BROWSER_API_KEY_SESSION_VERSION ||
      typeof payload.keyHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.keyHash) ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    const apiKey = await resolveApiKeyHash(payload.keyHash);
    if (!apiKey || !apiKeyCanCreateBrowserSession(apiKey)) {
      return null;
    }

    return apiKey;
  } catch {
    return null;
  }
}

async function resolveClerkBearerToken(rawToken: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  try {
    const claims = await verifyToken(rawToken, { secretKey });
    if (typeof claims.sub !== "string" || claims.sub.length === 0) {
      return null;
    }

    return {
      userId: claims.sub,
      ownerKey: getAuthOwnerKey({ type: "clerk", userId: claims.sub }),
    };
  } catch {
    return null;
  }
}

export async function getLegacyServerSession() {
  const cookieStore = await cookies();
  const token = readSessionTokenFromCookieStore(cookieStore);

  if (!token) {
    return null;
  }

  return resolveSession(token);
}

export async function getServerSession() {
  const clerkAuth = await auth();
  if (clerkAuth.isAuthenticated && clerkAuth.userId) {
    return {
      type: "clerk" as const,
      userId: clerkAuth.userId,
      ownerKey: getAuthOwnerKey({ type: "clerk", userId: clerkAuth.userId }),
    };
  }

  const cookieStore = await cookies();
  const browserApiKeyCookie = cookieStore.get(BROWSER_API_KEY_COOKIE_NAME)?.value;
  if (browserApiKeyCookie) {
    const apiKey = await resolveBrowserApiKeySession(browserApiKeyCookie);
    if (apiKey) {
      return {
        type: "apiKey" as const,
        apiKey,
        tokenSource: "cookie" as const,
      };
    }
  }

  const session = await getLegacyServerSession();
  if (!session) {
    return null;
  }

  return {
    type: "session" as const,
    session,
  };
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
  const allowBrowserApiKey = options.allowBrowserApiKey ?? allowApiKey;
  const allowClerk = options.allowClerk ?? true;
  const allowSession = options.allowSession ?? true;
  const bearerToken = parseBearerToken(request);

  if (allowApiKey) {
    if (bearerToken) {
      const apiKey = await resolveApiKey(bearerToken);
      if (apiKey) {
        return {
          type: "apiKey",
          apiKey,
          tokenSource: "bearer",
        };
      }
    }

    if (allowBrowserApiKey) {
      const browserApiKeyCookie = request.cookies.get(BROWSER_API_KEY_COOKIE_NAME)?.value;
      if (browserApiKeyCookie) {
        const apiKey = await resolveBrowserApiKeySession(browserApiKeyCookie);
        if (apiKey) {
          return {
            type: "apiKey",
            apiKey,
            tokenSource: "cookie",
          };
        }
      }
    }
  }

  if (allowClerk) {
    if (bearerToken) {
      const clerkBearerAuth = await resolveClerkBearerToken(bearerToken);
      if (clerkBearerAuth?.ownerKey) {
        return {
          type: "clerk",
          userId: clerkBearerAuth.userId,
          ownerKey: clerkBearerAuth.ownerKey,
          tokenSource: "bearer",
        };
      }
    }

    const clerkAuth = await auth();
    if (clerkAuth.isAuthenticated && clerkAuth.userId) {
      const ownerKey = getAuthOwnerKey({
        type: "clerk",
        userId: clerkAuth.userId,
      });
      if (!ownerKey) {
        return null;
      }

      return {
        type: "clerk",
        userId: clerkAuth.userId,
        ownerKey,
        tokenSource: bearerToken ? "bearer" : "cookie",
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
  const needsCsrf =
    auth.type === "session" ||
    (auth.type === "clerk" && auth.tokenSource === "cookie") ||
    (auth.type === "apiKey" && auth.tokenSource === "cookie");
  if (!needsCsrf || SAFE_METHODS.has(request.method)) {
    return null;
  }

  return validateUnsafeRequestOrigin(request);
}

export function validateUnsafeRequestOrigin(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) {
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

export function getRouteAuthOwnerKey(auth: RouteAuth) {
  if (auth.type === "clerk") {
    return auth.ownerKey;
  }

  if (auth.type === "apiKey") {
    return auth.apiKey.ownerKey;
  }

  return null;
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
  response.cookies.set({
    name: BROWSER_API_KEY_COOKIE_NAME,
    value: "",
    ...browserApiKeySessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
