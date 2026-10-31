import "server-only";
import { createHash, createHmac } from "node:crypto";
import { resolveApiKey } from "@/lib/auth-server";
import { API_KEY_PREFIX } from "@/lib/api-keys";
import { api, convex } from "@/lib/convex-server";

export const LANDING_SESSION_COOKIE = "ibx_landing_cli";
export const LANDING_SESSION_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function createSessionDemoCredentials(sessionId: string) {
  const serverSecret = process.env.IBX_CONVEX_SERVER_SECRET;
  if (!serverSecret || serverSecret.length < 32) {
    throw new Error("The demo workspace is unavailable.");
  }

  const derive = (purpose: string) =>
    createHmac("sha256", serverSecret)
      .update(`ibx-landing-demo:${purpose}:${sessionId}`)
      .digest("base64url");
  const apiKey = `${API_KEY_PREFIX}${derive("api-key")}`;
  return {
    apiKey,
    keyHash: createHash("sha256").update(apiKey).digest("hex"),
    ownerKey: `demo_${derive("owner").slice(0, 32)}`,
  };
}

export async function ensureSessionDemoAccount(sessionId: string) {
  const credentials = createSessionDemoCredentials(sessionId);
  const existing = await convex.query(api.apiKeys.getActiveByHash, {
    keyHash: credentials.keyHash,
  });

  if (existing) {
    if (existing.ownerKey !== credentials.ownerKey || existing.name !== "public demo") {
      throw new Error("The demo workspace could not be initialized.");
    }
    return { apiKey: credentials.apiKey, ownerKey: credentials.ownerKey, created: false };
  }

  await convex.mutation(api.apiKeys.create, {
    ownerKey: credentials.ownerKey,
    name: "public demo",
    keyHash: credentials.keyHash,
    prefix: API_KEY_PREFIX.slice(0, -1),
    last4: credentials.apiKey.slice(-4),
    permission: "both",
  });

  const verified = await resolveApiKey(credentials.apiKey).catch(() => null);
  if (!verified || verified.ownerKey !== credentials.ownerKey) {
    throw new Error("The demo workspace could not be initialized.");
  }
  return { apiKey: credentials.apiKey, ownerKey: credentials.ownerKey, created: true };
}
