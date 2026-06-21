import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function normalizeFilter(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    candidate === "zen" ||
    candidate === "today" ||
    candidate === "upcoming" ||
    candidate === "archive"
  ) {
    return candidate;
  }

  return "today";
}

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const initialFilter = normalizeFilter(resolvedSearchParams.view);

  return <AppShell initialAuthenticated initialFilter={initialFilter} />;
}
