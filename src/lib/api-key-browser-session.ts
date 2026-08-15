export type ApiKeyBrowserSessionPermission = "read" | "write" | "both";

export function apiKeyCanCreateBrowserSession(apiKey: {
  permission: ApiKeyBrowserSessionPermission;
}) {
  return apiKey.permission === "both";
}
