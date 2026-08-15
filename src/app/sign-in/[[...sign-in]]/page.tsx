import { SignIn } from "@clerk/nextjs";

import { ApiKeySignInForm } from "@/components/auth/api-key-sign-in-form";

function normalizeRedirectUrl(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/app";
  }

  return candidate;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const redirectUrl = normalizeRedirectUrl((await searchParams).redirect_url);

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="flex justify-center">
          <SignIn fallbackRedirectUrl={redirectUrl} forceRedirectUrl={redirectUrl} />
        </div>

        <section className="flex flex-col justify-center gap-5 rounded-lg border bg-card p-6">
          <header className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{"///"} API access</p>
            <h1 className="text-xl font-medium tracking-tight">
              Sign in with an API key
            </h1>
            <p className="text-sm text-muted-foreground">
              Use an existing full-access key for this browser session.
            </p>
          </header>
          <ApiKeySignInForm redirectUrl={redirectUrl} />
        </section>
      </div>
    </div>
  );
}
