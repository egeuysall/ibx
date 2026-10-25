import Link from "next/link";
import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { api, convex } from "@/lib/convex-server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

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
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="flex h-12 items-center justify-between border-b px-4 md:px-6">
      <Link href="/" className="text-sm">ibx</Link>
      <Button variant="ghost" size="sm" render={<Link href="/files" />}>your files</Button>
    </header>
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 md:px-6 md:py-16">
      <div className="flex flex-col gap-2"><h1 className="break-all text-2xl tracking-tight">{username}</h1>
        <p className="text-sm text-muted-foreground">public files and notes</p></div>
      <section className="flex flex-col gap-4" aria-labelledby="public-files-title">
        <h2 id="public-files-title" className="text-sm text-muted-foreground">files</h2>
        {files.page.length ? <Table><TableHeader><TableRow>
          <TableHead>name</TableHead><TableHead className="hidden sm:table-cell">type</TableHead><TableHead className="text-right">size</TableHead>
        </TableRow></TableHeader><TableBody>{files.page.map((file) => <TableRow key={file._id}>
          <TableCell className="max-w-0"><a href={`/${encodeURIComponent(username)}/${[...file.folderPath, file.fileName].map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer" className="block truncate no-underline transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{file.fileName}</a></TableCell>
          <TableCell className="hidden text-muted-foreground sm:table-cell">{file.contentType.split("/")[1]}</TableCell>
          <TableCell className="whitespace-nowrap text-right text-muted-foreground">{file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</TableCell>
        </TableRow>)}</TableBody></Table> : <Empty><EmptyHeader><EmptyTitle>no public files yet</EmptyTitle><EmptyDescription>Only files shared publicly appear here.</EmptyDescription></EmptyHeader></Empty>}
        {!files.isDone && <Button variant="outline" render={<Link href={`/${encodeURIComponent(username)}?cursor=${encodeURIComponent(files.continueCursor)}`} />}>next files</Button>}
      </section>
      {notes.length > 0 && <section className="flex flex-col gap-3" aria-labelledby="public-notes-title">
        <h2 id="public-notes-title" className="text-sm text-muted-foreground">public notes on bri</h2>
        {notes.map((note) => {
          try {
            const url = new URL(note.url);
            return url.protocol === "https:" ? <a key={note.url} href={url.href} target="_blank" rel="noreferrer" className="truncate border-b py-3 text-sm no-underline transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{note.title}</a> : null;
          } catch { return null; }
        })}
      </section>}
    </main>
  </div>;
}
