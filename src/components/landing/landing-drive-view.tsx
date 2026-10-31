"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { LandingDriveItem } from "@/lib/landing-public-data";

function leafName(path: string) {
  return path.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "drive";
}

export function LandingDriveView({ initialItems, initialFolder, folderId, demoSession }: { initialItems: LandingDriveItem[]; initialFolder: string; folderId: string | null; demoSession: string | null }) {
  const [items, setItems] = useState(initialItems.slice(0, 10));
  const [folderName, setFolderName] = useState(initialFolder);

  useEffect(() => {
    if (!demoSession || !/^[A-Za-z0-9_-]{32}$/.test(demoSession)) return;
    const navigationType = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigationType?.type === "reload") return;

    let active = true;
      const folderQuery = folderId ? `?folder=${encodeURIComponent(folderId)}` : "";
      void fetch(`/api/landing-workspace${folderQuery}`, { cache: "no-store", headers: { "x-ibx-demo-session": demoSession } })
      .then(async (response) => response.ok ? await response.json() as { drive?: LandingDriveItem[]; folderName?: string } : null)
      .then((payload) => {
        if (!active || !payload?.drive) return;
        setFolderName(payload.folderName ?? "drive");
        setItems(payload.drive.slice(0, 10));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [demoSession, folderId]);

  return (
    <section className="animate-enter" style={{ "--delay": "120ms" } as CSSProperties}>
      <h1 className="text-sm font-semibold leading-5">{folderName}</h1>
      <ul className="mt-5 space-y-3 text-[13px] leading-5">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-4">
            {item.size === "folder" ? (
              <Link className="min-w-0 truncate hover:underline" href={item.href}>{leafName(item.path)}/</Link>
            ) : (
              <a className="min-w-0 truncate hover:underline" href={item.href}>{leafName(item.path)}</a>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">{item.size}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground">no files in this folder</li>}
      </ul>
    </section>
  );
}
