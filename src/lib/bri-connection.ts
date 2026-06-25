import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const BRI_API_KEY_PATTERN = /^bri_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type EncryptedBriApiKey = {
  encryptedApiKey: string;
  iv: string;
  authTag: string;
};

type StoredBriConnection = EncryptedBriApiKey & {
  keyPrefix: string;
  keyLast4: string;
  verifiedAt: number;
  updatedAt: number;
};

export function readBriBaseUrl() {
  const baseUrl = process.env.BRI_BASE_URL?.trim() || "https://bri.fyi";
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function readConvexServerSecret() {
  const secret = process.env.IBX_CONVEX_SERVER_SECRET?.trim();
  return secret || null;
}

export function normalizeBriApiKey(input: unknown) {
  const apiKey = typeof input === "string" ? input.trim() : "";
  if (!apiKey || apiKey.length > 512 || !BRI_API_KEY_PATTERN.test(apiKey)) {
    return null;
  }

  return apiKey;
}

export function describeBriApiKey(apiKey: string) {
  const [prefix] = apiKey.split(".", 1);
  return {
    keyPrefix: prefix.slice(0, 64),
    keyLast4: apiKey.slice(-4),
  };
}

function getEncryptionKey() {
  const raw =
    process.env.BRI_CONNECTION_ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();
  if (!raw) {
    return null;
  }

  return createHash("sha256").update(raw).digest();
}

export function canEncryptBriConnections() {
  return getEncryptionKey() !== null;
}

export function encryptBriApiKey(apiKey: string): EncryptedBriApiKey | null {
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedApiKey: encrypted.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptBriApiKey(connection: StoredBriConnection) {
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(connection.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(connection.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(connection.encryptedApiKey, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function verifyBriApiKey(apiKey: string, baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/keys/verify`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: unknown };
    const message =
      typeof json.error === "string"
        ? json.error
        : "Bri API key verification failed.";
    throw new Error(message);
  }

  const json = (await response.json().catch(() => ({}))) as {
    data?: { permissions?: unknown };
  };
  const permissions = json.data?.permissions;
  if (permissions !== "write" && permissions !== "read_write") {
    throw new Error("Bri API key lacks write permission.");
  }
}
