"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { ATTACHMENT_CONTENT_TYPES } from "@/lib/attachment-policy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FilesShell } from "./files-shell";
import { fileTypeLabel, safeFileUrl, uploadError } from "./file-utils";
import type { FileRecord, FilesPage } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (response.status === 401) {
    window.location.assign("/");
    throw new Error("Your session expired. Please sign in again.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not update files.");
  return body;
}

export function FilesLibrary() {
  const [page, setPage] = useState<FilesPage | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileRecord | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const operation = useRef(false);

  const refresh = useCallback(async (minimum = 1) => {
    let result = await request<FilesPage>("/api/files");
    const files = new Map(result.files.map((file) => [file.id, file]));
    const cursors = new Set<string>();
    // Keep already-loaded pages available after an upload or visibility change.
    while (!result.isDone && result.cursor && files.size < minimum && !cursors.has(result.cursor)) {
      cursors.add(result.cursor);
      result = await request<FilesPage>(`/api/files?cursor=${encodeURIComponent(result.cursor)}`);
      for (const file of result.files) files.set(file.id, file);
    }
    setPage({ ...result, files: [...files.values()] });
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    request<FilesPage>("/api/files").then((result) => {
      if (active) setPage(result);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load files.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong.";
      setError(message);
      toast.error(message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!page?.cursor || page.isDone) return;
    const next = await request<FilesPage>(`/api/files?cursor=${encodeURIComponent(page.cursor)}`);
    setPage((current) => ({ ...next, files: [...new Map([...(current?.files ?? []), ...next.files].map((file) => [file.id, file])).values()] }));
    setError(null);
  }

  async function changeVisibility(file: FileRecord, isPublic: boolean) {
    const visibility = isPublic ? "public" : "private";
    await request(`/api/files/${encodeURIComponent(file.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility }),
    });
    // Hide revoked public links immediately, even if the subsequent refresh fails.
    setPage((current) => current && ({ ...current, files: current.files.map((item) => item.id === file.id
      ? { ...item, visibility, publicUrl: null } : item) }));
    toast.success(isPublic ? "File is public. Anyone with the link can access it." : "File is private.");
    await refresh(page?.files.length);
  }

  const query = search.trim().toLowerCase();
  const visible = page?.files.filter((file) => {
    const inFolder = selectedFolder === "all" || (file.parentKind === "file" &&
      (selectedFolder === "root" ? !file.folderId : file.folderId === selectedFolder));
    return inFolder && `${file.fileName} ${fileTypeLabel(file.contentType)} ${file.contentType}`.toLowerCase().includes(query);
  }) ?? [];

  return (
    <>
      <FilesShell username={page?.username ?? null}>
        <section className="flex flex-wrap items-start justify-between gap-3" aria-label="Upload files">
          <div className="flex flex-col gap-1">
            <p className="text-sm">your files</p>
            <p className="text-xs text-muted-foreground">pdf, images, text, audio & video · up to 30 MB each</p>
            <p className="text-xs text-muted-foreground">uploads are private. public files are accessible to anyone with the link.</p>
          </div>
          <Button variant="outline" disabled={busy || loading} onClick={() => picker.current?.click()}>upload file</Button>
          <input ref={picker} className="sr-only" tabIndex={-1} aria-label="Choose a file to upload" type="file"
            accept={ATTACHMENT_CONTENT_TYPES.join(",")} disabled={busy || loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const invalid = uploadError(file);
              if (invalid) { toast.error(invalid); return; }
              void run(async () => {
                const uploaded = await apiClient.uploadAttachmentFile({ parentKind: "file", parentId: "library", file });
                if (selectedFolder !== "all" && selectedFolder !== "root") {
                  await request(`/api/files/${encodeURIComponent(uploaded.id)}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: selectedFolder }),
                  });
                }
                toast.success("File uploaded privately.");
                await refresh((page?.files.length ?? 0) + 1);
              });
            }} />
        </section>
        <div className="flex flex-wrap items-center gap-2" aria-label="File folders">
          <Button size="sm" variant={selectedFolder === "all" ? "secondary" : "ghost"} onClick={() => setSelectedFolder("all")}>all files</Button>
          <Button size="sm" variant={selectedFolder === "root" ? "secondary" : "ghost"} onClick={() => setSelectedFolder("root")}>unfiled</Button>
          {page?.folders.map((folder) => <Button key={folder.id} size="sm"
            variant={selectedFolder === folder.id ? "secondary" : "ghost"} onClick={() => setSelectedFolder(folder.id)}>{folder.name}</Button>)}
          <form className="flex items-center gap-2" onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const { folder } = await request<{ folder: { id: string; name: string } }>("/api/files", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFolder }),
              });
              setNewFolder("");
              setSelectedFolder(folder.id);
              await refresh(page?.files.length);
              toast.success("Folder created.");
            });
          }}>
            <Input aria-label="New folder name" placeholder="new folder" maxLength={64} value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)} disabled={busy} className="h-8 w-36" />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !newFolder.trim()}>create folder</Button>
          </form>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="files-search" className="sr-only">Search loaded files</FieldLabel>
            <Input id="files-search" type="search" placeholder="search loaded files" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
        </FieldGroup>
        {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => refresh(page?.files.length))}>retry</Button>
        </div>}
        <p role="status" className="text-xs text-muted-foreground">
          {loading ? "loading files…" : `${visible.length} shown · ${page?.files.length ?? 0} loaded${page && !page.isDone ? " · load more to search more files" : ""}${busy ? " · working…" : ""}`}
        </p>
        {loading ? <div className="flex flex-col gap-3" aria-hidden><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          : visible.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{error ? "Files unavailable" : query ? "No matching loaded files" : "No files yet"}</EmptyTitle>
            <EmptyDescription>{query ? "Try another search or load more files below." : "Upload a file to keep it in your library. Todo and thought attachments appear here too."}</EmptyDescription></EmptyHeader></Empty>
          : <ul className="flex min-w-0 flex-col divide-y divide-border border-y border-border" aria-label="Files" aria-busy={busy}>
            {visible.map((file) => {
              const ownerUrl = safeFileUrl(file.url);
              const publicUrl = file.visibility === "public" ? safeFileUrl(file.publicUrl) : null;
              return <li key={file.id} className="flex min-w-0 flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm" title={file.fileName}>{file.fileName}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{fileTypeLabel(file.contentType)}</Badge>
                    <span>{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span>
                    <span>{file.parentKind === "file" ? "library" : `${file.parentKind} attachment`}</span>
                    {file.parentKind === "file" && file.folderId && <span>{page?.folders.find((folder) => folder.id === file.folderId)?.name}</span>}
                    <time dateTime={new Date(file.createdAt).toISOString()}>{new Date(file.createdAt).toLocaleDateString()}</time>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {file.parentKind === "file" && <select aria-label={`Move ${file.fileName} to folder`} value={file.folderId ?? "root"}
                    disabled={busy} onChange={(event) => void run(async () => {
                      const folderId = event.target.value === "root" ? null : event.target.value;
                      await request(`/api/files/${encodeURIComponent(file.id)}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId }),
                      });
                      setPage((current) => current && ({ ...current, files: current.files.map((item) => item.id === file.id ? { ...item, folderId } : item) }));
                      toast.success(folderId ? "File moved." : "File moved to unfiled.");
                    })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                    <option value="root">unfiled</option>{page?.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>}
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={file.visibility === "public"} disabled={busy}
                      aria-label={`Public access for ${file.fileName}`}
                      onCheckedChange={(checked) => void run(() => changeVisibility(file, checked))} />
                    {file.visibility}
                  </label>
                  {ownerUrl && <Button variant="outline" size="sm" render={<a href={ownerUrl} target="_blank" rel="noopener noreferrer" />} aria-label={`Open ${file.fileName}`}>open</Button>}
                  {publicUrl && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {
                    await navigator.clipboard.writeText(new URL(publicUrl, window.location.origin).href);
                    toast.success("Public link copied.");
                  })}>copy public link</Button>}
                  <Button variant="ghost" size="sm" disabled={busy} aria-label={`Delete ${file.fileName}`} onClick={() => setPendingDelete(file)}>delete</Button>
                </div>
              </li>;
            })}
          </ul>}
        {page && !page.isDone && page.cursor && <Button variant="outline" className="self-start" disabled={busy} onClick={() => void run(loadMore)}>load more</Button>}
      </FilesShell>
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !busy) setPendingDelete(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader><AlertDialogTitle>delete file?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes {pendingDelete?.fileName}, including its attachment and public link. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => void run(async () => {
              if (!pendingDelete) return;
              await request(`/api/files/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
              setPage((current) => current && ({ ...current, files: current.files.filter((file) => file.id !== pendingDelete.id) }));
              setPendingDelete(null);
              setError(null);
              toast.success("File deleted.");
            })}>{busy ? "deleting…" : "delete"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-right" />
    </>
  );
}
