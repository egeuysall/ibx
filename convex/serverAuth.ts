export function requireServerToken(token: string) {
  const secret = process.env.IBX_CONVEX_SERVER_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Configure IBX_CONVEX_SERVER_SECRET with at least 32 characters in Convex and the server environment.");
  }
  if (token !== secret) {
    throw new Error("Unauthorized server access.");
  }
}
