import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "iak_";
const API_KEY_BYTES = 24;

export function createApiKey() {
  const token = randomBytes(API_KEY_BYTES).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${token}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const last4 = rawKey.slice(-4);

  return {
    rawKey,
    keyHash,
    last4,
    prefix: API_KEY_PREFIX.slice(0, -1),
  };
}

