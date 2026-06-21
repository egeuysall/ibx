import { describe, expect, it } from "bun:test";

import { getAuthOwnerKey, canAccessOwnerScopedRow } from "./auth-owner";

describe("auth owner scoping", () => {
  it("uses Clerk user ids as owner keys for new user data", () => {
    expect(getAuthOwnerKey({ type: "clerk", userId: "user_123" })).toBe(
      "clerk:user_123",
    );
  });

  it("keeps legacy session and API-key auth on ownerless rows", () => {
    expect(getAuthOwnerKey({ type: "apiKey", ownerKey: null })).toBeNull();
    expect(getAuthOwnerKey({ type: "session" })).toBeNull();
    expect(canAccessOwnerScopedRow(null, null)).toBe(true);
  });

  it("prevents Clerk users from accessing ownerless or other-user rows", () => {
    const ownerKey = getAuthOwnerKey({ type: "clerk", userId: "user_123" });

    expect(canAccessOwnerScopedRow(ownerKey, "clerk:user_123")).toBe(true);
    expect(canAccessOwnerScopedRow(ownerKey, "clerk:user_456")).toBe(false);
    expect(canAccessOwnerScopedRow(ownerKey, null)).toBe(false);
  });
});
