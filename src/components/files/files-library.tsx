"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { ATTACHMENT_CONTENT_TYPES } from "@/lib/attachment-policy";
import { buildAttachmentViewUrl } from "@/lib/attachment-url";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Toaster } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export function FilesLibrary({ terminalStorageKey }: { terminalStorageKey: string }) {
  const [page, setPage] = useState<FilesPage | null>(null);
  const [search, setSearch] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileRecord | null>(null);
  const [preview, setPreview] = useState<FileRecord | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const cancelRename = useRef(false);

  const loadAllFiles = useCallback(async () => {
    let result = await request<FilesPage>("/api/files");
    const files = new Map(result.files.map((file) => [file.id, file]));
    const cursors = new Set<string>();
    while (!result.isDone && result.cursor && !cursors.has(result.cursor)) {
      cursors.add(result.cursor);
      result = await request<FilesPage>(`/api/files?cursor=${encodeURIComponent(result.cursor)}`);
      for (const file of result.files) files.set(file.id, file);
    }
    return { ...result, files: [...files.values()] };
  }, []);

  const refresh = useCallback(async () => {
    setPage(await loadAllFiles());
    setError(null);
  }, [loadAllFiles]);

  const navigateFolder = useCallback((folderId: string | null, replace = false) => {
    setCurrentFolderId(folderId);
    const url = new URL(window.location.href);
    if (folderId) url.searchParams.set("folder", folderId);
    else url.searchParams.delete("folder");
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
  }, []);

  useEffect(() => {
    let active = true;
    const syncFolderFromUrl = () => setCurrentFolderId(new URLSearchParams(window.location.search).get("folder"));
    syncFolderFromUrl();
    window.addEventListener("popstate", syncFolderFromUrl);
    loadAllFiles().then((result) => {
      if (active) setPage(result);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load files.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener("popstate", syncFolderFromUrl); };
  }, [loadAllFiles]);

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

  async function changeVisibility(file: FileRecord, isPublic: boolean) {
    const visibility = isPublic ? "public" : "private";
    await request(`/api/files/${encodeURIComponent(file.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility }),
    });
    // Hide revoked public links immediately, even if the subsequent refresh fails.
    setPage((current) => current && ({ ...current, files: current.files.map((item) => item.id === file.id
      ? { ...item, visibility, publicUrl: null } : item) }));
    toast.success(isPublic ? "File is public. Anyone with the link can access it." : "File is private.");
    await refresh();
  }

  async function moveFile(file: FileRecord, folderId: string | null) {
    const result = await request<{ folderId: string | null; publicUrl: string | null }>(`/api/files/${encodeURIComponent(file.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId }),
    });
    setPage((current) => current && ({ ...current, files: current.files.map((item) => item.id === file.id
      ? { ...item, folderId: result.folderId, publicUrl: result.publicUrl } : item) }));
    toast.success(folderId ? "File moved." : "File moved to drive.");
  }

  function startRename(file: FileRecord) {
    cancelRename.current = false;
    setEditingFileId(file.id);
    setEditingFileName(file.fileName);
  }

  function saveFileName(file: FileRecord) {
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const fileName = editingFileName.trim();
    if (!fileName) {
      toast.error("File name is required.");
      setEditingFileName(file.fileName);
      return;
    }
    if (fileName === file.fileName) {
      setEditingFileId(null);
      return;
    }
    void run(async () => {
      const result = await apiClient.renameFile(file.id, fileName);
      if (!("type" in result && result.type === "folder")) {
        setPage((current) => current && ({ ...current, files: current.files.map((item) => item.id === file.id
          ? { ...item, fileName: result.fileName, url: result.url ?? item.url, publicUrl: result.publicUrl } : item) }));
      }
      setEditingFileId(null);
      toast.success(`Renamed to ${result.fileName}.`);
    });
  }

  function startFolderRename(folder: FilesPage["folders"][number]) {
    cancelRename.current = false;
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  }

  function saveFolderName(folder: FilesPage["folders"][number]) {
    if (cancelRename.current) { cancelRename.current = false; return; }
    const name = editingFolderName.trim();
    if (!name) { toast.error("Folder name is required."); setEditingFolderName(folder.name); return; }
    if (name === folder.name) { setEditingFolderId(null); return; }
    void run(async () => {
      await apiClient.renameFile(folder.id, name);
      setEditingFolderId(null);
      await refresh();
      toast.success(`Renamed folder to ${name}.`);
    });
  }

  function openPreview(file: FileRecord) {
    if (safeFileUrl(buildAttachmentViewUrl(file.id, file.publicUrl))) setPreview(file);
    else toast.error("Could not open this file.");
  }

  const query = search.trim().toLowerCase();
  const visibleFolders = query ? [] : page?.folders.filter((folder) => folder.parentFolderId === currentFolderId) ?? [];
  const visibleFiles = page?.files.filter((file) => (query || (file.folderId ?? null) === currentFolderId) &&
    `${file.fileName} ${fileTypeLabel(file.contentType)} ${file.contentType}`.toLowerCase().includes(query)) ?? [];
  const folderById = new Map((page?.folders ?? []).map((folder) => [folder.id, folder]));
  const breadcrumbs: FilesPage["folders"] = [];
  for (let id = currentFolderId; id;) {
    const folder = folderById.get(id);
    if (!folder) break;
    breadcrumbs.unshift(folder);
    id = folder.parentFolderId;
  }
  const folderOptions = [
    { id: "root", label: "drive" },
    ...(page?.folders ?? []).map((folder) => ({ id: folder.id, label: folder.path.join("/") || folder.name })),
  ];
  const previewUrl = preview ? safeFileUrl(buildAttachmentViewUrl(preview.id, preview.publicUrl)) : null;

  return (
    <>
      <FilesShell username={page?.username ?? null} terminalStorageKey={terminalStorageKey}>
        <input ref={picker} className="sr-only" tabIndex={-1} aria-label="Choose a file to upload" type="file"
          accept={ATTACHMENT_CONTENT_TYPES.join(",")} disabled={busy || loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const invalid = uploadError(file);
            if (invalid) { toast.error(invalid); return; }
            void run(async () => {
              await apiClient.uploadAttachmentFile({ parentKind: "file", parentId: "library", ...(currentFolderId ? { folderId: currentFolderId } : {}), file });
              toast.success("File uploaded privately.");
              await refresh();
            });
          }} />
        <div className="flex flex-wrap items-center justify-between gap-3" aria-label="File folders">
          <nav aria-label="Folder location" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            <button type="button" className="text-sm text-foreground hover:underline" onClick={() => navigateFolder(null)}>drive</button>
            {breadcrumbs.map((folder) => <span key={folder.id} className="flex items-center gap-1">
              <span aria-hidden="true" className="text-muted-foreground">/</span>
              <Button size="sm" variant={folder.id === currentFolderId ? "secondary" : "ghost"} onClick={() => navigateFolder(folder.id)}>{folder.name}</Button>
            </span>)}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="default" disabled={busy || loading} onClick={() => picker.current?.click()}>upload file</Button>
            <form className="flex items-center gap-2" onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const { folder } = await request<{ folder: { id: string; name: string } }>("/api/files", {
                  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFolder, parentFolderId: currentFolderId }),
                });
                setNewFolder("");
                navigateFolder(folder.id);
                await refresh();
                toast.success("Folder created.");
              });
            }}>
              <Input aria-label="New folder name" placeholder="new folder" maxLength={64} value={newFolder}
                onChange={(event) => setNewFolder(event.target.value)} disabled={busy} className="h-8 w-36 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
              <Button type="submit" variant="secondary" disabled={busy || !newFolder.trim()}>create folder</Button>
            </form>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">&gt;</span>
          <Input id="files-search" type="search" aria-label="Search files" placeholder="search files" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
        </div>
        {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(refresh)}>retry</Button>
        </div>}
        <p role="status" className="text-xs text-muted-foreground">
          {loading ? "loading files…" : `${visibleFolders.length + visibleFiles.length} shown${busy ? " · working…" : ""}`}
        </p>
        {loading ? <div className="flex flex-col gap-3" aria-hidden><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          : visibleFolders.length + visibleFiles.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{error ? "Files unavailable" : query ? "No matching loaded files" : "No files yet"}</EmptyTitle>
            <EmptyDescription>{query ? "Try another search." : "Upload a file to keep it in your library. Todo and thought attachments appear here too."}</EmptyDescription></EmptyHeader></Empty>
          : <div className="-mx-4 w-[calc(100%+2rem)] md:-mx-6 md:w-[calc(100%+3rem)]">
            <Table aria-label="Files" aria-busy={busy} className="border-y border-border">
            <TableHeader><TableRow>
              <TableHead className="w-full text-xs font-normal text-muted-foreground">name</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground">type</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground">modified</TableHead>
              <TableHead className="text-xs font-normal text-muted-foreground">public</TableHead>
              <TableHead className="text-right text-xs font-normal text-muted-foreground">actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visibleFolders.map((folder) => <TableRow key={folder.id} className={dropTargetId === folder.id ? "bg-accent" : ""}
                onDragOver={(event) => { event.preventDefault(); setDropTargetId(folder.id); }} onDragLeave={() => setDropTargetId(null)}
                onDrop={(event) => { event.preventDefault(); setDropTargetId(null); const id = event.dataTransfer.getData("text/plain"); const file = page?.files.find((item) => item.id === id); if (file) void run(() => moveFile(file, folder.id)); }}>
                <TableCell>{editingFolderId === folder.id ? <div className="flex items-center gap-2"><span aria-hidden="true" className="w-4 shrink-0 text-center font-mono">/</span><Input autoFocus aria-label="Rename folder" maxLength={64} value={editingFolderName} disabled={busy} onChange={(event) => setEditingFolderName(event.target.value)} onBlur={() => saveFolderName(folder)} onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === "Escape") { event.preventDefault(); cancelRename.current = true; setEditingFolderName(folder.name); setEditingFolderId(null); event.currentTarget.blur(); }
                }} className="h-7 max-w-sm border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" /></div> : <button type="button" className="flex items-center gap-2 text-left hover:underline" title="Press F2 to rename" onClick={() => navigateFolder(folder.id)} onKeyDown={(event) => { if (event.key === "F2") { event.preventDefault(); startFolderRename(folder); } }}><span aria-hidden="true" className="w-4 shrink-0 text-center font-mono">/</span>{folder.name}</button>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">folder</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell />
              </TableRow>)}
              {visibleFiles.map((file) => {
                const publicUrl = file.visibility === "public" ? safeFileUrl(file.publicUrl) : null;
                const selectedFolder = folderOptions.find((option) => option.id === (file.folderId ?? "root")) ?? folderOptions[0];
                return <TableRow key={file.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", file.id); event.dataTransfer.effectAllowed = "move"; }}>
                  <TableCell className="max-w-0"><div className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="w-4 shrink-0 text-center font-mono">-</span>{editingFileId === file.id ? <Input autoFocus aria-label="Rename file" maxLength={180} value={editingFileName} disabled={busy} onChange={(event) => setEditingFileName(event.target.value)} onBlur={() => saveFileName(file)} onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                    if (event.key === "Escape") { event.preventDefault(); cancelRename.current = true; setEditingFileName(file.fileName); setEditingFileId(null); event.currentTarget.blur(); }
                  }} className="h-7 min-w-0 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" /> : <button type="button" className="min-w-0 truncate text-left hover:underline" title={file.fileName} onClick={() => openPreview(file)}>{file.fileName}</button>}</div></TableCell>
                  <TableCell><Badge variant="secondary">{fileTypeLabel(file.contentType)}</Badge><span className="sr-only">{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span></TableCell>
                  <TableCell><time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={new Date(file.createdAt).toISOString()}>{new Date(file.createdAt).toLocaleDateString()}</time></TableCell>
                  <TableCell><div className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={file.visibility === "public"} disabled={busy} aria-label={`Public access for ${file.fileName}`} onCheckedChange={(checked) => void run(() => changeVisibility(file, checked))} /><span>{file.visibility}</span></div></TableCell>
                  <TableCell><div className="flex items-center justify-end gap-2">
                    <Combobox items={folderOptions} value={selectedFolder} itemToStringValue={(option) => option.label}
                      onValueChange={(option) => { if (option) void run(() => moveFile(file, option.id === "root" ? null : option.id)); }}>
                      <ComboboxInput aria-label={`Move ${file.fileName} to folder`} disabled={busy} className="h-8 w-40" />
                      <ComboboxContent className="min-w-44 border border-border"><ComboboxEmpty>No folders found.</ComboboxEmpty><ComboboxList>{(option) => <ComboboxItem className="whitespace-nowrap" key={option.id} value={option}>{option.label}</ComboboxItem>}</ComboboxList></ComboboxContent>
                    </Combobox>
                    {publicUrl && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(new URL(publicUrl, window.location.origin).href); toast.success("Public link copied."); })}>copy public link</Button>}
                    <Button variant="ghost" size="sm" disabled={busy} aria-label={`Rename ${file.fileName}`} onClick={() => startRename(file)}>rename</Button>
                    <Button variant="ghost" size="sm" disabled={busy} aria-label={`Delete ${file.fileName}`} onClick={() => setPendingDelete(file)}>delete</Button>
                  </div></TableCell>
                </TableRow>;
              })}
            </TableBody>
            </Table>
          </div>}
      </FilesShell>
      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-[min(56rem,calc(100%-2rem))] gap-3 p-3 sm:max-w-3xl">
          <DialogHeader className="pe-8">
            <DialogTitle className="truncate text-sm">{preview?.fileName ?? "File"}</DialogTitle>
            <DialogDescription>
              {preview ? <>{fileTypeLabel(preview.contentType)} / {preview.size < 1024 * 1024 ? `${Math.ceil(preview.size / 1024)} KB` : `${(preview.size / 1024 / 1024).toFixed(1)} MB`}
                {preview.publicUrl && <> / <a href={preview.publicUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">public link</a></>}</> : null}
            </DialogDescription>
          </DialogHeader>
          {preview && previewUrl && <div className="overflow-hidden rounded-lg border border-border bg-background">
            {preview.contentType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={preview.fileName} className="max-h-[70vh] w-full object-contain" />
            ) : preview.contentType.startsWith("video/") ? (
              <video src={previewUrl} controls playsInline preload="metadata" aria-label={preview.fileName} className="max-h-[70vh] w-full" />
            ) : preview.contentType.startsWith("audio/") ? (
              <audio src={previewUrl} controls preload="metadata" aria-label={preview.fileName} className="w-full" />
            ) : preview.contentType === "application/pdf" ? (
              <iframe src={previewUrl} title={preview.fileName} className="h-[70vh] w-full" />
            ) : (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block p-4 underline">open file</a>
            )}
          </div>}
        </DialogContent>
      </Dialog>
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
