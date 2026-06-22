import { SignInButton, SignUpButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function normalizeFilter(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    candidate === "zen" ||
    candidate === "upcoming" ||
    candidate === "archive"
  ) {
    return candidate;
  }

  return "today";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const session = await getServerSession();
  const resolvedSearchParams = await searchParams;
  const initialFilter = normalizeFilter(resolvedSearchParams.view);

  if (session) {
    redirect(initialFilter === "today" ? "/app" : `/app?view=${initialFilter}`);
  }

  return <LandingPage />;
}

function LandingPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2" prefetch={false}>
          <Image src="/favicon.ico" alt="" width={24} height={24} />
        </Link>

        <div className="flex items-center gap-2">
          <SignInButton
            mode="modal"
            fallbackRedirectUrl="/app"
            forceRedirectUrl="/app"
          >
            <Button variant="ghost" size="sm">
              sign in
            </Button>
          </SignInButton>
          <SignUpButton
            mode="modal"
            fallbackRedirectUrl="/app"
            forceRedirectUrl="/app"
          >
            <Button size="sm">start</Button>
          </SignUpButton>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100dvh-65px)] w-full max-w-6xl items-center gap-10 px-5 pb-10 pt-6 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:pb-16">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            <h1 className="max-w-xl text-4xl! font-semibold leading-tight tracking-normal md:text-6xl">
              Turn loose thoughts into a live execution list.
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
              Capture tasks, generate plans, schedule work blocks, and keep a
              focused daily list synced across web, CLI, shortcuts, and iOS.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <SignUpButton
              mode="modal"
              fallbackRedirectUrl="/app"
              forceRedirectUrl="/app"
            >
              <Button size="lg">create account</Button>
            </SignUpButton>
            <SignInButton
              mode="modal"
              fallbackRedirectUrl="/app"
              forceRedirectUrl="/app"
            >
              <Button variant="outline" size="lg">
                sign in
              </Button>
            </SignInButton>
          </div>
        </div>

        <div className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-foreground" />
              <span className="text-sm">today</span>
            </div>
            <span className="text-xs text-muted-foreground">
              online / synced
            </span>
          </div>
          <div className="space-y-4 p-4">
            <div className="rounded-md border bg-background p-3">
              <p className="text-sm text-muted-foreground">
                &gt; schedule launch checklist after lunch and keep the evening
                clear
              </p>
            </div>
            {[
              [
                "p1",
                "Prepare onboarding path for first public users",
                "2h / today",
              ],
              ["p2", "Review API key and mobile auth flows", "1h / today"],
              ["p3", "Archive completed shortcut captures", "30m / today"],
            ].map(([priority, title, meta]) => (
              <div
                key={title}
                className="flex items-start gap-3 rounded-md border bg-background p-3"
              >
                <span className="mt-1 size-4 rounded-full border border-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {meta}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6">{title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
