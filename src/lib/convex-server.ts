import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required.");
}

const client = new ConvexHttpClient(convexUrl);

function serverArgs<Ref extends FunctionReference<"query" | "mutation" | "action">>(
  args: Omit<FunctionArgs<Ref>, "serverToken">,
): FunctionArgs<Ref> {
  const serverToken = process.env.IBX_CONVEX_SERVER_SECRET;
  if (!serverToken || serverToken.length < 32) {
    throw new Error("Configure IBX_CONVEX_SERVER_SECRET with at least 32 characters in Convex and the server environment.");
  }
  return { ...args, serverToken } as FunctionArgs<Ref>;
}

export const convex = {
  query<Ref extends FunctionReference<"query", "public">>(
    ref: Ref,
    args: Omit<FunctionArgs<Ref>, "serverToken">,
  ): Promise<FunctionReturnType<Ref>> {
    return client.query(ref, serverArgs<Ref>(args));
  },
  mutation<Ref extends FunctionReference<"mutation", "public">>(
    ref: Ref,
    args: Omit<FunctionArgs<Ref>, "serverToken">,
  ): Promise<FunctionReturnType<Ref>> {
    return client.mutation(ref, serverArgs<Ref>(args));
  },
  action<Ref extends FunctionReference<"action", "public">>(
    ref: Ref,
    args: Omit<FunctionArgs<Ref>, "serverToken">,
  ): Promise<FunctionReturnType<Ref>> {
    return client.action(ref, serverArgs<Ref>(args));
  },
};
export { api };
