import Link from "next/link";
import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { api, convex } from "@/lib/convex-server";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { PublicFilesTerminal } from "@/components/files/public-files-terminal";
import { PublicProfileAvatar } from "@/components/public-profile-avatar";
import { fileTypeLabel } from "@/components/files/file-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public files · ibx", description: "Public files and notes shared on ibx." };

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { username } = await params;
  const { cursor = null } = await searchParams;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username) || (cursor && cursor.length > 4_000)) notFound();
  const { data: users } = await (await clerkClient()).users.getUserList({ username: [username], limit: 1 });
  const owner = users.find((user) => user.username === username);
  if (!owner) notFound();
  const ownerKey = `clerk:${owner.id}`;
  const [files, notes] = await Promise.all([
    convex.query(api.attachments.paginatePublicFiles, { ownerKey, paginationOpts: { numItems: 50, cursor } }),
    convex.query(api.publications.listPublic, { ownerKey }),
  ]);
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

        <section className="space-y-3" aria-labelledby="public-files-title">
          <h2 id="public-files-title" className="text-xs text-muted-foreground">Published files</h2>
          {files.page.length ? <div className="divide-y divide-border border-y border-border">
            {files.page.map((file) => {
              const href = `/${encodeURIComponent(username)}/${[...file.folderPath, file.fileName].map(encodeURIComponent).join("/")}`;
              return <a key={file._id} href={href} target="_blank" rel="noreferrer" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-3 no-underline transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_8rem_5rem]">
                <span className="min-w-0 truncate text-sm text-foreground">{file.fileName}</span>
                <span className="col-start-1 truncate text-[11px] text-muted-foreground sm:col-start-2" title={`drive/${file.folderPath.join("/")}`}>{file.folderPath.length ? `drive/${file.folderPath.join("/")}` : "drive"}</span>
                <span className="row-span-2 text-right text-xs text-muted-foreground sm:row-span-1">{fileTypeLabel(file.contentType)} · {file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</span>
              </a>;
            })}
          </div> : <Empty><EmptyHeader><EmptyTitle>no public files yet</EmptyTitle><EmptyDescription>Only files shared publicly appear here.</EmptyDescription></EmptyHeader></Empty>}
          {!files.isDone && <Button variant="outline" render={<Link href={`/${encodeURIComponent(username)}?cursor=${encodeURIComponent(files.continueCursor)}`} />}>next files</Button>}
        </section>

        <section className="space-y-3" aria-labelledby="public-terminal-title">
          <h2 id="public-terminal-title" className="text-xs text-muted-foreground">Terminal</h2>
          <PublicFilesTerminal username={username} files={files.page.map((file) => ({
            fileName: file.fileName,
            folderPath: file.folderPath,
            href: `/${encodeURIComponent(username)}/${[...file.folderPath, file.fileName].map(encodeURIComponent).join("/")}`,
            contentType: file.contentType,
            size: file.size,
          }))} />
        </section>

        <section className="space-y-3" aria-labelledby="public-notes-title">
          <h2 id="public-notes-title" className="text-xs text-muted-foreground">Published notes on Bri</h2>
          {notes.length ? notes.map((note) => {
            try {
              const url = new URL(note.url);
              return url.protocol === "https:" ? <a key={note.url} href={url.href} target="_blank" rel="noreferrer" className="block rounded-sm border border-border px-3 py-3 no-underline transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <p className="text-sm">{note.title}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{url.hostname}{url.pathname}</p>
              </a> : null;
            } catch { return null; }
          }) : <p className="text-xs text-muted-foreground">No published notes.</p>}
        </section>
      </div>
    </section>
  </main>;
}
