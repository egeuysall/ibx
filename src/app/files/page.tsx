import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { FilesLibrary } from "@/components/files/files-library";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function FilesPage() {
  const session = await getServerSession();
  if (!session) redirect("/");
  const ownerKey = session.type === "clerk" ? session.ownerKey
    : session.type === "apiKey" ? session.apiKey.ownerKey : "legacy";
  return <FilesLibrary terminalStorageKey={`ibx:terminal:v1:${ownerKey}`} />;
}
