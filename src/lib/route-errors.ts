import { NextResponse } from "next/server";

/**
 * A route that throws (a Convex call that fails, a bad id) would answer with a bare 500 and nothing in the logs
 * to say why. This logs one line with the route and the error, which `wrangler tail` shows, and answers 500 as JSON.
 * The response says nothing about the cause: only the log does.
 */
export function guarded<Args extends unknown[]>(
  name: string,
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error(
        JSON.stringify({
          route: name,
          error: e.name,
          message: e.message.replace(/\s+/g, " ").slice(0, 400),
        }),
      );
      return NextResponse.json(
        { error: "Something went wrong. Try again." },
        { status: 500 },
      );
    }
  };
}
