import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

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
    <div className="mx-auto flex min-h-screen w-full max-w-[620px] flex-col px-6 py-8 sm:px-8 sm:py-10">
      <header className="pb-8">
        <div className="flex items-end justify-between gap-6 pb-5">
          <Link href="/" className="text-[15px] text-foreground hover:text-muted-foreground focus-visible:text-muted-foreground">ibx</Link>
          <p className="text-xs text-muted-foreground">authentication</p>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-[400px]">
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            fallbackRedirectUrl={redirectUrl}
            forceRedirectUrl={redirectUrl}
          />
        </div>
      </main>
      <footer className="pt-8 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-4 pt-5">
          <a href="https://github.com/egeuysall/ibx" target="_blank" rel="noopener noreferrer" className="hover:text-foreground focus-visible:text-foreground">github</a>
          <p>&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
