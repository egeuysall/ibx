import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireServerToken } from "./serverAuth";

const originalSecret = process.env.IBX_CONVEX_SERVER_SECRET;
const testSecret = "test-only-server-boundary-secret-32-characters";

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.IBX_CONVEX_SERVER_SECRET;
  } else {
    process.env.IBX_CONVEX_SERVER_SECRET = originalSecret;
  }
});

describe("trusted server token", () => {
  it("fails closed for missing, empty, or short configuration", () => {
    delete process.env.IBX_CONVEX_SERVER_SECRET;
    assert.throws(() => requireServerToken(testSecret), /Configure IBX_CONVEX_SERVER_SECRET/);
    for (const secret of ["", "too-short"]) {
      process.env.IBX_CONVEX_SERVER_SECRET = secret;
      assert.throws(() => requireServerToken(secret), /Configure IBX_CONVEX_SERVER_SECRET/);
    }
  });

  it("rejects missing, empty, and incorrect tokens", () => {
    process.env.IBX_CONVEX_SERVER_SECRET = testSecret;
    for (const token of [undefined, null, "", "wrong", `${testSecret}x`]) {
      assert.throws(() => requireServerToken(token as string), /Unauthorized/);
    }
  });

  it("accepts only the configured server token", () => {
    process.env.IBX_CONVEX_SERVER_SECRET = testSecret;
    assert.doesNotThrow(() => requireServerToken(testSecret));
  });
});
