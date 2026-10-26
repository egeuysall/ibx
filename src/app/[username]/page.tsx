import Link from "next/link";
import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import type { FunctionReturnType } from "convex/server";
import { api, convex } from "@/lib/convex-server";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { PublicFilesTerminal } from "@/components/files/public-files-terminal";
import { PublicFileViewer } from "@/components/files/public-file-viewer";
import { PublicProfileAvatar } from "@/components/public-profile-avatar";
import { browsePublicFiles } from "@/lib/public-drive";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public files · ibx", description: "Public files and notes shared on ibx." };

const NOTES_PER_PAGE = 5;
type PublicFilesPage = FunctionReturnType<typeof api.attachments.paginatePublicFiles>;

type PublicNote = { title: string; url: string; createdAt: number };

function parsePage(value: string | string[] | undefined) {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function folderHref(username: string, path: string[], notePage: number) {
  const query = new URLSearchParams();
  if (path.length) query.set("folder", path.join("/"));
  if (notePage > 1) query.set("notePage", String(notePage));
  const suffix = query.size ? `?${query}` : "";
  return `/${encodeURIComponent(username)}${suffix}`;
}

async function listAllPublicFiles(ownerKey: string) {
  const files: PublicFilesPage["page"] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const result: PublicFilesPage = await convex.query(api.attachments.paginatePublicFiles, {
      ownerKey,
      paginationOpts: { numItems: 100, cursor },
    });
    files.push(...result.page);
    if (result.isDone || seenCursors.has(result.continueCursor)) return files;
    seenCursors.add(result.continueCursor);
    cursor = result.continueCursor;
  }
}

async function listBriPublicNotes(username: string): Promise<PublicNote[] | null> {
  try {
    const response = await fetch(`https://bri.fyi/api/public/notes/${encodeURIComponent(username)}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) return null;
    return body.data.flatMap((item): PublicNote[] => {
      if (!item || typeof item !== "object") return [];
      const note = item as { username?: unknown; slug?: unknown; title?: unknown; createdAt?: unknown };
      if (note.username !== username || typeof note.slug !== "string" || typeof note.title !== "string") return [];
      return [{
        title: note.title,
        url: new URL(`/${encodeURIComponent(username)}/${encodeURIComponent(note.slug)}`, "https://bri.fyi").href,
        createdAt: typeof note.createdAt === "number" && Number.isFinite(note.createdAt) ? note.createdAt : 0,
      }];
    });
  } catch {
    return null;
  }
}

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ folder?: string | string[]; notePage?: string | string[] }>;
}) {
  const { username } = await params;
  const query = await searchParams;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username)) notFound();
  const { data: users } = await (await clerkClient()).users.getUserList({ username: [username], limit: 1 });
  const owner = users.find((user) => user.username === username);
  if (!owner) notFound();
  const ownerKey = `clerk:${owner.id}`;
  const [files, briNotes, mirroredNotes] = await Promise.all([
    listAllPublicFiles(ownerKey),
    listBriPublicNotes(username),
    convex.query(api.publications.listPublic, { ownerKey }),
  ]);
  const notes = (briNotes ?? mirroredNotes.map((note) => ({ ...note, createdAt: 0 })))
    .sort((a, b) => b.createdAt - a.createdAt);
  const pageCount = Math.max(1, Math.ceil(notes.length / NOTES_PER_PAGE));
  const notePage = Math.min(parsePage(query.notePage), pageCount);
  const visibleNotes = notes.slice((notePage - 1) * NOTES_PER_PAGE, notePage * NOTES_PER_PAGE);

  const requestedPathValue = Array.isArray(query.folder) ? query.folder[0] : query.folder ?? "";
  const requestedPath = requestedPathValue.split("/").filter(Boolean);
  const { path: currentPath, folders: childFolders, files: visibleFiles } = browsePublicFiles(files, requestedPath);
  const fileHref = (file: typeof files[number]) => `/${encodeURIComponent(username)}/${[...file.folderPath, file.fileName].map(encodeURIComponent).join("/")}`;

  return <main className="min-h-dvh bg-background text-foreground">
    <section className="w-full animate-enter px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-155 space-y-8">
        <header className="flex flex-col items-start gap-3">
          <PublicProfileAvatar name={username} />
          <div className="space-y-2">
            <h1 className="break-all text-base font-semibold">@{username}</h1>
            <p className="text-xs text-muted-foreground">{notes.length} published notes · public files</p>
          </div>
        </header>

        <section className="space-y-3" aria-labelledby="public-terminal-title">
          <h2 id="public-terminal-title" className="text-xs text-muted-foreground">Terminal</h2>
          <PublicFilesTerminal username={username} files={files.map((file) => ({
            fileName: file.fileName,
            folderPath: file.folderPath,
            href: fileHref(file),
            contentType: file.contentType,
            size: file.size,
          }))} />
        </section>

        <section className="space-y-3" aria-labelledby="public-files-title">
          <h2 id="public-files-title" className="text-xs text-muted-foreground">Published files</h2>
          <nav aria-label="Folder location" className="flex flex-wrap items-center gap-1 text-sm">
            <Link href={folderHref(username, [], notePage)} className="hover:underline">drive</Link>
            {currentPath.map((segment, index) => <span key={index} className="flex items-center gap-1">
              <span aria-hidden="true" className="text-muted-foreground">/</span>
              <Link href={folderHref(username, currentPath.slice(0, index + 1), notePage)} className="hover:underline">{segment}</Link>
            </span>)}
          </nav>
          {childFolders.length + visibleFiles.length ? <div className="divide-y divide-border border-y border-border">
            {childFolders.map((folder) => <Link key={folder} href={folderHref(username, [...currentPath, folder], notePage)} className="flex items-center gap-3 px-3 py-3 text-sm no-underline transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono">/</span><span>{folder}</span>
            </Link>)}
            {visibleFiles.map((file) => <PublicFileViewer key={file._id} fileName={file.fileName} contentType={file.contentType} href={fileHref(file)} className="px-3 py-3 text-sm transition-colors hover:bg-muted/60" />)}
          </div> : <Empty><EmptyHeader><EmptyTitle>{files.length ? "folder is empty" : "no public files yet"}</EmptyTitle><EmptyDescription>{files.length ? "Choose another folder." : "Only files shared publicly appear here."}</EmptyDescription></EmptyHeader></Empty>}
        </section>

        <section className="space-y-3" aria-labelledby="public-notes-title">
          <h2 id="public-notes-title" className="text-xs text-muted-foreground">Published notes</h2>
          {notes.length ? visibleNotes.map((note) => {
            try {
              const url = new URL(note.url);
              return url.protocol === "https:" ? <a key={note.url} href={url.href} className="block rounded-sm border border-border px-3 py-3 no-underline transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <p className="text-sm">{note.title}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{url.hostname}{url.pathname}</p>
              </a> : null;
            } catch { return null; }
          }) : <p className="text-xs text-muted-foreground">No published notes.</p>}
          {pageCount > 1 && <Pagination>
            <PaginationContent>
              <PaginationItem><PaginationPrevious disabled={notePage <= 1} render={notePage > 1 ? <Link href={folderHref(username, currentPath, notePage - 1)} /> : undefined} /></PaginationItem>
              <PaginationItem><PaginationLink size="default" isActive disabled>{notePage} / {pageCount}</PaginationLink></PaginationItem>
              <PaginationItem><PaginationNext disabled={notePage >= pageCount} render={notePage < pageCount ? <Link href={folderHref(username, currentPath, notePage + 1)} /> : undefined} /></PaginationItem>
            </PaginationContent>
          </Pagination>}
        </section>
      </div>
    </section>
  </main>;
}
