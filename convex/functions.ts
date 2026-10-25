import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { mutation as baseMutation, query as baseQuery } from "./_generated/server";
import { requireServerToken } from "./serverAuth";

const serverBoundary = {
  args: { serverToken: v.string() },
  input: (_ctx: unknown, { serverToken }: { serverToken: string }) => {
    requireServerToken(serverToken);
    return { ctx: {}, args: {} };
  },
};

export const query = customQuery(baseQuery, serverBoundary);
export const mutation = customMutation(baseMutation, serverBoundary);
