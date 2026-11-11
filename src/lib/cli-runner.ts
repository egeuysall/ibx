import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type Runner = { fetch: (input: string, init?: RequestInit) => Promise<Response> };

export type RunnerResult = { output: string; code: number | null };

export function getCliRunner(): Runner | null {
  try {
    const env = getCloudflareContext().env as { CLI_RUNNER?: Runner };
    return env.CLI_RUNNER ?? null;
  } catch {
    return null;
  }
}

export async function callCliRunner(runner: Runner, sessionId: string, payload: Record<string, unknown>): Promise<RunnerResult> {
  const response = await runner.fetch("https://runner/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": sessionId },
    body: JSON.stringify({ sessionId, ...payload }),
  });
  if (!response.ok) throw new Error(`cli runner returned ${response.status}`);
  return (await response.json()) as RunnerResult;
}
