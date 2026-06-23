import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth-server";
import {
  normalizeCliAuthParam,
  normalizeCliRedirectUri,
} from "@/lib/cli-auth";

export const dynamic = "force-dynamic";

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildCurrentPath(params: {
  redirect_uri: string;
  state: string;
  code_challenge: string;
}) {
  const searchParams = new URLSearchParams(params);
  return `/cli-auth?${searchParams.toString()}`;
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect_uri?: string | string[];
    state?: string | string[];
    code_challenge?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const redirectUri = normalizeCliRedirectUri(
    getStringParam(resolvedSearchParams.redirect_uri),
  );
  const state = normalizeCliAuthParam(getStringParam(resolvedSearchParams.state));
  const codeChallenge = normalizeCliAuthParam(
    getStringParam(resolvedSearchParams.code_challenge),
  );

  if (!redirectUri || !state || !codeChallenge) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">invalid cli login request</h1>
          <p className="text-sm text-muted-foreground">
            Restart `ibx auth login` from your terminal.
          </p>
        </div>
      </main>
    );
  }

  const session = await getServerSession();
  const currentPath = buildCurrentPath({
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
  });
  if (!session) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(currentPath)}`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <form
        action="/api/cli-auth/authorize"
        method="post"
        className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-5"
      >
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">ibx cli</p>
          <h1 className="text-xl font-semibold">authorize terminal access</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            This creates a scoped API key for your local `ibx` CLI. You can
            revoke it from settings any time.
          </p>
        </div>
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <Button type="submit" className="w-full">
          authorize cli
        </Button>
      </form>
    </main>
  );
}
