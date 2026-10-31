import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { SettingsView } from "@/components/layout/settings-view";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  return <SettingsView apiKeySession={session.type === "apiKey"} />;
}
