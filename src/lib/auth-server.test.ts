import { describe, expect, it } from "bun:test";

import {
  apiKeyCanCreateBrowserSession,
  type ApiKeyBrowserSessionPermission,
} from "./api-key-browser-session";

function apiKeyWithPermission(
  permission: ApiKeyBrowserSessionPermission,
) {
  return {
    permission,
  };
}

describe("browser API-key sessions", () => {
  it("only allows full-permission API keys to create browser sessions", () => {
    expect(apiKeyCanCreateBrowserSession(apiKeyWithPermission("both"))).toBe(
      true,
    );
    expect(apiKeyCanCreateBrowserSession(apiKeyWithPermission("read"))).toBe(
      false,
    );
    expect(apiKeyCanCreateBrowserSession(apiKeyWithPermission("write"))).toBe(
      false,
    );
  });
});
