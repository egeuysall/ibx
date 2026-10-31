"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { LandingDriveItem } from "@/lib/landing-public-data";

type PreviewData = {
  tasks: Array<{ title: string; when: string; detail?: string }>;
  drive: LandingDriveItem[];
};

export function IbxFeatureScenes({ initialData }: { initialData: PreviewData }) {
  const [data, setData] = useState<PreviewData>(initialData);

  useEffect(() => {
    let active = true;
    const refresh = (event: Event) => {
      const sessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (!sessionId) return;
      void fetch("/api/landing-workspace", { cache: "no-store", headers: { "x-ibx-demo-session": sessionId } })
      .then(async (response) => {
        if (!response.ok) throw new Error("workspace unavailable");
        return await response.json() as PreviewData;
      })
      .then((next) => { if (active) setData(next); })
      .catch(() => undefined);
    };
    window.addEventListener("ibx:landing-workspace-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("ibx:landing-workspace-updated", refresh);
    };
  }, []);

  return (
    <div className="mt-10 space-y-10">
      <section aria-labelledby="focus-title" className="animate-enter" style={{ "--delay": "120ms" } as CSSProperties}>
        <h2 id="focus-title" className="text-sm font-semibold leading-5">today</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-5">
          {data.tasks.slice(0, 10).map((task, index) => (
            <li key={`${task.title}-${index}`} className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1">{task.title}</span>
              <span className="shrink-0 text-right text-xs leading-4 text-muted-foreground">
                {[task.when, task.detail].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
          {data.tasks.length === 0 && <li className="text-xs text-muted-foreground">no open tasks</li>}
        </ul>
      </section>

      <section aria-labelledby="drive-title" className="animate-enter" style={{ "--delay": "200ms" } as CSSProperties}>
        <h2 id="drive-title" className="text-sm font-semibold leading-5">drive</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-5">
          {data.drive.slice(0, 10).map((item) => (
            <li key={item.id} className="flex items-baseline gap-3">
              <a href={item.href} className="min-w-0 flex-1 truncate hover:underline" title={item.path}>
                {item.path.toLowerCase()}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{item.size}</span>
            </li>
          ))}
          {data.drive.length === 0 && <li className="text-xs text-muted-foreground">no files yet</li>}
        </ul>
      </section>

    </div>
  );
}
