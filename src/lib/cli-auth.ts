import "server-only";

import { createHash, randomBytes } from "node:crypto";

const CLI_AUTH_CODE_BYTES = 32;
const CLI_AUTH_PARAM_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export const CLI_AUTH_CODE_TTL_MS = 5 * 60 * 1000;

export function createCliAuthCode() {
  return randomBytes(CLI_AUTH_CODE_BYTES).toString("base64url");
}

export function hashCliAuthValue(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function normalizeCliAuthParam(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!CLI_AUTH_PARAM_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeCliRedirectUri(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
      return null;
    }

    const port = Number.parseInt(url.port, 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      return null;
    }

    if (url.username || url.password || url.hash) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
