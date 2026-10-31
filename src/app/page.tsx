import { SignUpButton } from "@clerk/nextjs";
import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { IbxFeatureScenes } from "@/components/landing/ibx-feature-scenes";
import { IbxCliTerminal } from "@/components/landing/ibx-cli-terminal";
import { getServerSession } from "@/lib/auth-server";
import { getIbxSiteUrl, getPublicLandingFiles } from "@/lib/landing-public-data";

export const dynamic = "force-dynamic";

function normalizeFilter(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "zen" || candidate === "upcoming" || candidate === "archive") {
    return candidate;
  }
  return "today";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [session, resolvedSearchParams] = await Promise.all([
    getServerSession(),
    searchParams,
  ]);
  const initialFilter = normalizeFilter(resolvedSearchParams.view);

  if (session) {
    redirect(initialFilter === "today" ? "/app" : `/app?view=${initialFilter}`);
  }

  return <LandingPage />;
}

async function LandingPage() {
  const publicFiles = await getPublicLandingFiles();
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ibx",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, macOS, Windows, Linux",
    description: "turn thoughts into tasks, keep notes and files together, and continue across the web, cli, and phone.",
    url: getIbxSiteUrl(),
    image: `${getIbxSiteUrl()}/opengraph-image`,
    author: { "@type": "Person", name: "Ege Uysal", url: "https://egeuysal.com" },
    publisher: { "@type": "Organization", name: "ibx", url: getIbxSiteUrl() },
    isAccessibleForFree: true,
    featureList: ["task planning", "file drive", "rich task notes", "command line interface", "calendar feeds", "offline access"],
  };

  return (
    <div data-landing-shell className="mx-auto flex min-h-dvh w-full max-w-[620px] flex-col px-6 py-10 font-mono sm:px-8 sm:py-12">
      <header className="flex items-end justify-between gap-6 pb-10">
        <Link href="/" className="text-sm font-semibold tracking-normal text-foreground" prefetch={false}>ibx</Link>
        <nav className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="account">
          <Link href="/sign-in?redirect_url=/app" className="hover:text-foreground" prefetch={false}>sign in</Link>
          <SignUpButton mode="modal" fallbackRedirectUrl="/app" forceRedirectUrl="/app">
            <button className="hover:text-foreground" type="button">sign up</button>
          </SignUpButton>
        </nav>
      </header>

      <main className="flex-1 pb-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication).replace(/</g, "\\u003c") }} />
        <section aria-labelledby="landing-title" className="animate-enter" style={{ "--delay": "40ms" } as CSSProperties}>
          <h1 id="landing-title" className="text-sm font-semibold leading-5 tracking-normal text-foreground">
            make room for what matters.
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            keep your tasks, files, notes, and next steps together. pick up from the web, drive, cli, or phone.
          </p>
        </section>

        <IbxFeatureScenes initialData={{
          tasks: [
            { title: "finish the first draft", when: "09:30", detail: "high · 2h" },
            { title: "send the notes", when: "11:00", detail: "normal · 1h" },
            { title: "review the launch plan", when: "13:00", detail: "normal · 1h" },
            { title: "take a walk", when: "15:30", detail: "low · 30m" },
          ],
          drive: publicFiles.slice(0, 10),
        }} />
        <div className="animate-enter" style={{ "--delay": "280ms" } as CSSProperties}>
          <IbxCliTerminal />
        </div>

      </main>

      <footer className="flex items-center justify-between pt-8 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <a href="https://github.com/egeuysall/ibx" target="_blank" rel="noreferrer" className="hover:text-foreground">github</a>
          <Link href="/docs" className="hover:text-foreground">docs</Link>
        </div>
        <p>© {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
