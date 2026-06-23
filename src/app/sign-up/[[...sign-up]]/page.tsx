import { SignUp } from "@clerk/nextjs";

function normalizeRedirectUrl(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/app";
  }

  return candidate;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const redirectUrl = normalizeRedirectUrl((await searchParams).redirect_url);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp fallbackRedirectUrl={redirectUrl} forceRedirectUrl={redirectUrl} />
    </div>
  );
}
