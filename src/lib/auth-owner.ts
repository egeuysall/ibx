export type OwnerScopedAuth =
  | { type: "clerk"; userId: string }
  | { type: "apiKey"; ownerKey?: string | null }
  | { type: "session" };

export function getAuthOwnerKey(auth: OwnerScopedAuth) {
  if (auth.type === "clerk") {
    return `clerk:${auth.userId}`;
  }

  if (auth.type === "apiKey") {
    return auth.ownerKey ?? null;
  }

  return null;
}

export function canAccessOwnerScopedRow(
  authOwnerKey: string | null,
  rowOwnerKey: string | null | undefined,
) {
  if (authOwnerKey === null) {
    return rowOwnerKey === null || rowOwnerKey === undefined;
  }

  return rowOwnerKey === authOwnerKey;
}
