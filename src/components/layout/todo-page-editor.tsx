"use client";

import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { ApiError, apiClient } from "@/lib/apiClient";
import { getCachedTodos, setCachedTodos } from "@/lib/indexedDb";
import {
  enqueueOfflineOperation,
  listOfflineAttachments,
  removeOfflineAttachment,
  upsertManyOfflineAttachments,
  upsertOfflineAttachment,
  type OfflineAttachment,
} from "@/lib/offline/db";
import { getTodoPageHref } from "@/lib/todo-slug";
import type { AttachmentRecord, TodoItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT = [
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
].join(",");

type EditorValue = {
  text: string;
  json: JSONContent;
  html: string;
};

type TodoPageEditorProps = {
  todoId: string;
};

function parseTodoNotesJson(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as JSONContent;
  } catch {
    return null;
  }
}

function defaultEditorJson(text: string | null | undefined): JSONContent {
  if (!text?.trim()) {
    return { type: "doc", content: [] };
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: text.trim() }],
      },
    ],
  };
}

function attachmentRecordFromOffline(
  attachment: OfflineAttachment,
): AttachmentRecord {
  return {
    id: attachment.id,
    parentKind: attachment.parentKind,
    parentId: attachment.parentId,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    status: "uploaded",
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  };
}

function offlineAttachmentFromRecord(
  attachment: AttachmentRecord,
): OfflineAttachment {
  return {
    id: attachment.id,
    parentKind: attachment.parentKind,
    parentId: attachment.parentId,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    storageId: null,
    status: "uploaded",
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
    lastError: null,
  };
}

function displayDate(timestamp: number | null) {
  if (typeof timestamp !== "number") {
    return "no due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function parseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export function TodoPageEditor({ todoId }: TodoPageEditorProps) {
  const router = useRouter();
  const isOnline = useOfflineStatus();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [todo, setTodo] = useState<TodoItem | null>(null);
  const [title, setTitle] = useState("");
  const [editorValue, setEditorValue] = useState<EditorValue | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const resolvedEditorValue = useMemo(() => {
    if (editorValue?.json) {
      return editorValue.json;
    }

    return parseTodoNotesJson(todo?.notesJson) ?? defaultEditorJson(todo?.notes);
  }, [editorValue, todo?.notes, todo?.notesJson]);

  const cacheTodo = useCallback(async (nextTodo: TodoItem) => {
    const cachedTodos = await getCachedTodos().catch(() => []);
    const hasTodo = cachedTodos.some((item) => item.id === nextTodo.id);
    const nextTodos = hasTodo
      ? cachedTodos.map((item) => (item.id === nextTodo.id ? nextTodo : item))
      : [nextTodo, ...cachedTodos];
    await setCachedTodos(nextTodos).catch(() => undefined);
  }, []);

  const loadAttachments = useCallback(async () => {
    const cachedAttachments = await listOfflineAttachments("todo", todoId).catch(
      () => [],
    );
    if (cachedAttachments.length > 0) {
      setAttachments(cachedAttachments.map(attachmentRecordFromOffline));
    }

    if (!isOnline || todoId.startsWith("local-")) {
      return;
    }

    try {
      const { attachments: remoteAttachments } =
        await apiClient.listAttachments("todo", todoId);
      setAttachments(remoteAttachments);
      await upsertManyOfflineAttachments(
        remoteAttachments.map(offlineAttachmentFromRecord),
      ).catch(() => undefined);
    } catch (error) {
      if (!(error instanceof ApiError && error.isNetworkError)) {
        toast.error(parseErrorMessage(error));
      }
    }
  }, [isOnline, todoId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      const cachedTodos = await getCachedTodos().catch(() => []);
      const cachedTodo = cachedTodos.find((item) => item.id === todoId) ?? null;
      if (cachedTodo && !cancelled) {
        setTodo(cachedTodo);
        setTitle(cachedTodo.title);
        setEditorValue({
          text: cachedTodo.notes ?? "",
          json:
            parseTodoNotesJson(cachedTodo.notesJson) ??
            defaultEditorJson(cachedTodo.notes),
          html: cachedTodo.notesHtml ?? "",
        });
      }

      if (isOnline && !todoId.startsWith("local-")) {
        try {
          const { todo: remoteTodo } = await apiClient.getTodo(todoId);
          if (!cancelled) {
            setTodo(remoteTodo);
            setTitle(remoteTodo.title);
            setEditorValue({
              text: remoteTodo.notes ?? "",
              json:
                parseTodoNotesJson(remoteTodo.notesJson) ??
                defaultEditorJson(remoteTodo.notes),
              html: remoteTodo.notesHtml ?? "",
            });
            await cacheTodo(remoteTodo);
          }
        } catch (error) {
          if (!cachedTodo && !cancelled) {
            toast.error(parseErrorMessage(error));
          }
        }
      }

      if (!cancelled) {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheTodo, isOnline, todoId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  const savePage = async () => {
    if (!todo) {
      return;
    }

    const normalizedTitle = title.trim().slice(0, 140);
    if (!normalizedTitle) {
      toast.error("todo title is required");
      return;
    }

    const nextNotes = editorValue?.text.trim().slice(0, 4_000) || null;
    const nextNotesJson = editorValue?.json
      ? JSON.stringify(editorValue.json)
      : null;
    const nextNotesHtml = editorValue?.html.trim() || null;
    const nextTodo: TodoItem = {
      ...todo,
      title: normalizedTitle,
      notes: nextNotes,
      notesJson: nextNotesJson,
      notesHtml: nextNotesHtml,
    };

    setTodo(nextTodo);
    setTitle(normalizedTitle);
    await cacheTodo(nextTodo);
    setIsSaving(true);

    const queueUpdate = async () => {
      await enqueueOfflineOperation({
        entity: "todo",
        entityId: todo.id,
        kind: todo.id.startsWith("local-") ? "create" : "update",
        payload: {
          title: normalizedTitle,
          notes: nextNotes,
          notesJson: nextNotesJson,
          notesHtml: nextNotesHtml,
          localId: todo.id,
          status: todo.status,
          dueDate: todo.dueDate,
          estimatedHours: todo.estimatedHours,
          timeBlockStart: todo.timeBlockStart,
          recurrence: todo.recurrence,
          priority: todo.priority,
          source: todo.source,
        },
      });
      toast.message("page saved offline");
    };

    if (!isOnline || todo.id.startsWith("local-")) {
      await queueUpdate();
      setIsSaving(false);
      return;
    }

    try {
      await apiClient.updateTodo(todo.id, {
        title: normalizedTitle,
        notes: nextNotes,
        notesJson: nextNotesJson,
        notesHtml: nextNotesHtml,
      });
      toast.message("page saved");
      router.replace(getTodoPageHref(nextTodo));
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await queueUpdate();
        return;
      }

      toast.error(parseErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAttachmentSelected = async (files: FileList | null) => {
    if (!todo) {
      return;
    }

    const file = files?.item(0);
    if (!file) {
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("attachment must be 10 MB or smaller");
      return;
    }

    const saveOfflineAttachment = async () => {
      const now = Date.now();
      const localAttachment: OfflineAttachment = {
        id: `local-attachment-${crypto.randomUUID()}`,
        parentKind: "todo",
        parentId: todo.id,
        fileName: file.name || "attachment",
        contentType: file.type || "application/octet-stream",
        size: file.size,
        blob: file,
        storageId: null,
        status: "local",
        createdAt: now,
        updatedAt: now,
        lastError: null,
      };
      await upsertOfflineAttachment(localAttachment);
      await enqueueOfflineOperation({
        entity: "attachment",
        entityId: localAttachment.id,
        kind: "upload",
        payload: {
          parentKind: "todo",
          parentId: todo.id,
          fileName: localAttachment.fileName,
          contentType: localAttachment.contentType,
          size: localAttachment.size,
        },
      });
      setAttachments((current) => [
        attachmentRecordFromOffline(localAttachment),
        ...current,
      ]);
      toast.message("attachment saved offline");
    };

    setIsUploading(true);
    if (!isOnline || todo.id.startsWith("local-")) {
      await saveOfflineAttachment();
      setIsUploading(false);
      return;
    }

    try {
      await apiClient.uploadAttachmentFile({
        parentKind: "todo",
        parentId: todo.id,
        file,
      });
      toast.message("attachment uploaded");
      await loadAttachments();
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await saveOfflineAttachment();
        return;
      }

      toast.error(parseErrorMessage(error));
    } finally {
      setIsUploading(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    }
  };

  const openAttachment = async (attachment: AttachmentRecord) => {
    if (attachment.id.startsWith("local-attachment-")) {
      const localAttachment = await listOfflineAttachments(
        attachment.parentKind,
        attachment.parentId,
      )
        .then((items) => items.find((item) => item.id === attachment.id))
        .catch(() => null);
      if (localAttachment?.blob) {
        window.open(URL.createObjectURL(localAttachment.blob), "_blank", "noopener");
      }
      return;
    }

    try {
      const { url } = await apiClient.getAttachmentUrl(attachment.id);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(parseErrorMessage(error));
    }
  };

  const deleteAttachment = async (attachment: AttachmentRecord) => {
    if (attachment.id.startsWith("local-attachment-")) {
      await removeOfflineAttachment(attachment.id).catch(() => undefined);
      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
      return;
    }

    try {
      await apiClient.deleteAttachment(attachment.id);
      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
      await removeOfflineAttachment(attachment.id).catch(() => undefined);
    } catch (error) {
      toast.error(parseErrorMessage(error));
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster />
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 md:px-8 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <Link href="/app" className="hover:text-foreground">
            ibx
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                isOnline ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <span>{isOnline ? "online" : "offline"}</span>
          </div>
        </div>

        {isLoading && !todo ? (
          <p className="text-sm text-muted-foreground">loading page...</p>
        ) : todo ? (
          <div className="flex flex-1 flex-col gap-5">
            <div className="flex flex-col gap-3 border-b border-border pb-5">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-normal shadow-none ring-0 focus-visible:ring-0 md:text-5xl"
                maxLength={140}
                aria-label="Todo title"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{todo.status}</span>
                <span>/</span>
                <span>p{todo.priority}</span>
                <span>/</span>
                <span>{displayDate(todo.dueDate)}</span>
                <span>/</span>
                <span>{todo.estimatedHours ?? 0}h</span>
              </div>
            </div>

            <section className="min-h-[50vh] flex-1">
              <SimpleEditor
                value={resolvedEditorValue}
                embedded
                autoFocus
                placeholder="write context, links, notes, and next steps..."
                onChange={(value) => setEditorValue(value)}
              />
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void savePage()} disabled={isSaving}>
                  {isSaving ? "saving..." : "save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  {isUploading ? "attaching..." : "attach"}
                </Button>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  accept={ATTACHMENT_ACCEPT}
                  onChange={(event) =>
                    void handleAttachmentSelected(event.currentTarget.files)
                  }
                />
              </div>

              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border border-border px-2 py-1 text-muted-foreground"
                    >
                      <button
                        type="button"
                        className="max-w-60 truncate text-left hover:text-foreground hover:underline"
                        onClick={() => void openAttachment(attachment)}
                      >
                        {attachment.fileName}
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => void deleteAttachment(attachment)}
                        aria-label={`Delete ${attachment.fileName}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">no attachments</p>
              )}
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">todo not found</p>
            <Button
              variant="outline"
              className="w-fit"
              render={<Link href="/app" />}
            >
              back to app
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
