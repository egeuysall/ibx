import Link from "next/link";
import type { CSSProperties } from "react";
import { LandingDriveView } from "@/components/landing/landing-drive-view";
import { getPublicLandingFiles, type LandingDriveItem } from "@/lib/landing-public-data";

export const dynamic = "force-dynamic";

export default async function LandingDrivePage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string | string[]; demo?: string | string[] }>;
}) {
  const [params, publicFiles] = await Promise.all([searchParams, getPublicLandingFiles()]);
  const folder = Array.isArray(params.folder) ? params.folder[0] : params.folder;
  const demoSession = Array.isArray(params.demo) ? params.demo[0] : params.demo;
  const knownPaths = new Set<string>();
  for (const file of publicFiles) {
    const parts = file.path.split("/").filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) knownPaths.add(parts.slice(0, index).join("/"));
  }

  const selectedPath = folder && knownPaths.has(folder) ? folder : "";
  const folders: LandingDriveItem[] = [...knownPaths]
    .filter((path) => path.split("/").slice(0, -1).join("/") === selectedPath)
    .map((path) => ({ id: `public-folder-${path}`, name: path.split("/").at(-1) ?? path, path: `/${path}`, size: "folder", href: `/landing-drive?folder=${encodeURIComponent(path)}` }));
  const files = publicFiles.filter((file) => file.path.split("/").filter(Boolean).slice(0, -1).join("/") === selectedPath);
  const initialItems = [...folders, ...files].slice(0, 10);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[620px] px-6 py-10 font-mono sm:px-8 sm:py-12">
      <header className="animate-enter flex items-center justify-between pb-10 text-xs text-muted-foreground" style={{ "--delay": "40ms" } as CSSProperties}>
        <Link href="/" className="text-sm font-semibold text-foreground">ibx</Link>
        <Link href="/" className="hover:text-foreground">back</Link>
      </header>
      <LandingDriveView initialItems={initialItems} initialFolder={selectedPath.split("/").at(-1)?.toLowerCase() ?? "drive"} folderId={folder ?? null} demoSession={demoSession ?? null} />
    </main>
  );
}
