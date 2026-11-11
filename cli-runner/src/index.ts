import { Container, getContainer } from "@cloudflare/containers";

export class IbxCli extends Container {
  defaultPort = 8080;
  sleepAfter = "3m";
}

type Env = { IBX_CLI: DurableObjectNamespace<IbxCli> };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const sessionId = request.headers.get("x-session-id") ?? "";
    if (!/^[A-Za-z0-9_-]{32}$/.test(sessionId)) return new Response("bad session", { status: 400 });
    return getContainer(env.IBX_CLI, sessionId).fetch(request);
  },
};
