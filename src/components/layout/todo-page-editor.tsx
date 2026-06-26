"use client";

import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Toaster } from "@/components/ui/sonner";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useTheme } from "@/hooks/useTheme";
import { ApiError, apiClient } from "@/lib/apiClient";
import { getCachedTodos, setCachedTodos } from "@/lib/indexedDb";
import {
  enqueueOfflineOperation,
  listOfflineAttachments,
  removeOfflineAttachment,
  removeOfflineOperationsByEntity,
  upsertManyOfflineAttachments,
  upsertOfflineAttachment,
  type OfflineAttachment,
} from "@/lib/offline/db";
import { flushPendingPublicationOperations } from "@/lib/offline/publication-sync";
import { getTodoPageHref } from "@/lib/todo-slug";
import type {
  AttachmentRecord,
  PublicationRecord,
  TodoItem,
  TodoPriority,
  TodoRecurrence,
  TodoStatus,
} from "@/lib/types";

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

type TodoPropertyOption<T extends string> = {
  value: T;
  label: string;
};

type AttachmentPreview = {
  attachment: AttachmentRecord;
  url: string;
  isBlobUrl: boolean;
};

const STATUS_OPTIONS: Array<TodoPropertyOption<TodoStatus>> = [
  { value: "open", label: "open" },
  { value: "done", label: "done" },
];

const PRIORITY_OPTIONS: Array<TodoPropertyOption<`${TodoPriority}`>> = [
  { value: "1", label: "P1" },
  { value: "2", label: "P2" },
  { value: "3", label: "P3" },
];

const RECURRENCE_OPTIONS: Array<TodoPropertyOption<TodoRecurrence>> = [
  { value: "none", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const TIME_BLOCK_OPTIONS: Array<TodoPropertyOption<string>> = [
  { value: "", label: "No time block" },
  { value: "480", label: "8:00 AM" },
  { value: "540", label: "9:00 AM" },
  { value: "600", label: "10:00 AM" },
  { value: "660", label: "11:00 AM" },
  { value: "720", label: "12:00 PM" },
  { value: "780", label: "1:00 PM" },
  { value: "840", label: "2:00 PM" },
  { value: "900", label: "3:00 PM" },
  { value: "960", label: "4:00 PM" },
  { value: "1020", label: "5:00 PM" },
];

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

function todoContentSignature(input: {
  title: string;
  notes: string | null;
  notesJson: string | null;
  notesHtml: string | null;
}) {
  return JSON.stringify({
    title: input.title,
    notes: input.notes,
    notesJson: input.notesJson,
    notesHtml: input.notesHtml,
  });
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
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function getTodoDateKey(timestamp: number | null) {
  if (typeof timestamp !== "number") {
    return "";
  }

  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyToTimestamp(dateKey: string) {
  const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateKeyToLocalDate(dateKey: string) {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function localDateToDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function normalizeEstimatedHours(hours: number | null | undefined) {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return null;
  }

  return Math.round(hours * 4) / 4;
}

function formatEstimatedHoursInput(hours: number | null | undefined) {
  const normalizedHours = normalizeEstimatedHours(hours);
  if (normalizedHours === null) {
    return "";
  }

  const totalMinutes = Math.round(normalizedHours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;

  if (wholeHours > 0 && remainderMinutes > 0) {
    return `${wholeHours}h ${remainderMinutes}m`;
  }

  if (wholeHours > 0) {
    return `${wholeHours}h`;
  }

  return `${remainderMinutes}m`;
}

function parseEstimatedHoursInput(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  let parsedHours: number | null = null;

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    parsedHours = Number(trimmed);
  } else if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hoursText, minutesText] = trimmed.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);
    if (
      Number.isInteger(hours) &&
      Number.isInteger(minutes) &&
      hours >= 0 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      parsedHours = hours + minutes / 60;
    }
  } else {
    const durationPattern =
      /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g;
    const matches = Array.from(trimmed.matchAll(durationPattern));
    if (matches.length === 0) {
      return undefined;
    }

    const leftover = trimmed
      .replace(/\band\b/g, " ")
      .replace(durationPattern, " ")
      .replace(/\s+/g, "");
    if (leftover.length > 0) {
      return undefined;
    }

    let totalMinutes = 0;
    for (const match of matches) {
      const value = Number(match[1]);
      const unit = match[2];
      if (!Number.isFinite(value) || value <= 0 || !unit) {
        return undefined;
      }

      totalMinutes += unit.startsWith("h") ? value * 60 : value;
    }

    parsedHours = totalMinutes / 60;
  }

  if (parsedHours === null || !Number.isFinite(parsedHours)) {
    return undefined;
  }

  if (parsedHours < 0.25 || parsedHours > 24) {
    return undefined;
  }

  return Math.round(parsedHours * 4) / 4;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[exponent]
  }`;
}

function isImageAttachment(attachment: AttachmentRecord) {
  return attachment.contentType.toLowerCase().startsWith("image/");
}

function getAttachmentViewUrl(attachment: AttachmentRecord) {
  return `/api/attachments/${encodeURIComponent(attachment.id)}/file`;
}

function getAttachmentKindLabel(attachment: AttachmentRecord) {
  const contentType = attachment.contentType.toLowerCase();
  if (contentType.includes("pdf")) {
    return "PDF";
  }
  if (contentType.includes("markdown")) {
    return "MD";
  }
  if (contentType.startsWith("text/")) {
    return "TXT";
  }
  if (contentType.startsWith("image/")) {
    return "IMG";
  }

  const extension = attachment.fileName.split(".").pop()?.trim();
  return extension ? extension.slice(0, 4).toUpperCase() : "FILE";
}

export function TodoPageEditor({ todoId }: TodoPageEditorProps) {
  const router = useRouter();
  const isOnline = useOfflineStatus();
  useTheme();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef("");
  const [todo, setTodo] = useState<TodoItem | null>(null);
  const [title, setTitle] = useState("");
  const [editorValue, setEditorValue] = useState<EditorValue | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [publication, setPublication] = useState<PublicationRecord | null>(null);
  const [attachmentPreview, setAttachmentPreview] =
    useState<AttachmentPreview | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => {
    return () => {
      if (attachmentPreview?.isBlobUrl) {
        URL.revokeObjectURL(attachmentPreview.url);
      }
    };
  }, [attachmentPreview]);

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
        lastSavedSignatureRef.current = todoContentSignature(cachedTodo);
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
            lastSavedSignatureRef.current = todoContentSignature(remoteTodo);
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

  useEffect(() => {
    if (!todo) {
      return;
    }

    document.title = `${todo.title.toLowerCase()} · ibx`;
  }, [todo]);

  useEffect(() => {
    if (!isOnline || todoId.startsWith("local-")) {
      return;
    }

    void (async () => {
      await flushPendingPublicationOperations().catch(() => undefined);
      await apiClient
        .getPublication("todo", todoId)
        .then(({ publication: nextPublication }) =>
          setPublication(
            nextPublication?.status === "published" ? nextPublication : null,
          ),
        )
        .catch(() => undefined);
    })();
  }, [isOnline, todoId]);

  const savePage = async (options: { silent?: boolean } = {}) => {
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
    const nextSignature = todoContentSignature(nextTodo);

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
      if (!options.silent) {
        toast.message("page saved offline");
      }
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
      lastSavedSignatureRef.current = nextSignature;
      if (publication) {
        const { publication: nextPublication } = await apiClient.publishToBri({
          sourceKind: "todo",
          sourceId: todo.id,
          title: normalizedTitle,
          notes: nextNotes,
          notesJson: editorValue?.json ?? nextNotesJson,
          visibility: publication.visibility,
        });
        setPublication(nextPublication);
      }
      if (!options.silent) {
        toast.message(publication ? "page saved and Bri updated" : "page saved");
      }
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

  useEffect(() => {
    if (isLoading || !todo || isSaving) {
      return;
    }

    const normalizedTitle = title.trim().slice(0, 140);
    if (!normalizedTitle) {
      return;
    }

    const nextNotes = editorValue?.text.trim().slice(0, 4_000) || null;
    const nextNotesJson = editorValue?.json
      ? JSON.stringify(editorValue.json)
      : null;
    const nextNotesHtml = editorValue?.html.trim() || null;
    const nextSignature = todoContentSignature({
      title: normalizedTitle,
      notes: nextNotes,
      notesJson: nextNotesJson,
      notesHtml: nextNotesHtml,
    });

    if (nextSignature === lastSavedSignatureRef.current) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void savePage({ silent: true });
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [editorValue, isLoading, isSaving, title, todo]);

  const saveTodoPatch = async (
    patch: Partial<
      Pick<
        TodoItem,
        | "status"
        | "dueDate"
        | "estimatedHours"
        | "timeBlockStart"
        | "recurrence"
        | "priority"
      >
    >,
    apiPatch: {
      status?: TodoStatus;
      dueDate?: string | null;
      estimatedHours?: number | null;
      timeBlockStart?: number | null;
      recurrence?: TodoRecurrence;
      priority?: TodoPriority;
    },
  ) => {
    if (!todo) {
      return false;
    }

    const previousTodo = todo;
    const nextTodo: TodoItem = { ...todo, ...patch };
    setTodo(nextTodo);
    await cacheTodo(nextTodo);

    const queueUpdate = async () => {
      await enqueueOfflineOperation({
        entity: "todo",
        entityId: todo.id,
        kind: todo.id.startsWith("local-") ? "create" : "update",
        payload: {
          ...patch,
          ...(todo.id.startsWith("local-")
            ? {
                title: nextTodo.title,
                notes: nextTodo.notes,
                notesJson: nextTodo.notesJson,
                notesHtml: nextTodo.notesHtml,
                localId: nextTodo.id,
                status: nextTodo.status,
                dueDate: nextTodo.dueDate,
                estimatedHours: nextTodo.estimatedHours,
                timeBlockStart: nextTodo.timeBlockStart,
                recurrence: nextTodo.recurrence,
                priority: nextTodo.priority,
                source: nextTodo.source,
              }
            : {}),
        },
      });
    };

    try {
      if (!isOnline || todo.id.startsWith("local-")) {
        await queueUpdate();
        toast.message("todo updated offline");
        return true;
      }

      await apiClient.updateTodo(todo.id, apiPatch);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await queueUpdate();
        toast.message("todo updated offline");
        return true;
      }

      setTodo(previousTodo);
      await cacheTodo(previousTodo);
      toast.error(parseErrorMessage(error));
      return false;
    }
  };

  const updateStatus = async (nextStatus: TodoStatus) => {
    if (!todo || nextStatus === todo.status) {
      return;
    }

    await saveTodoPatch({ status: nextStatus }, { status: nextStatus });
  };

  const updatePriority = async (value: string) => {
    const nextPriority = Number(value);
    if (
      !todo ||
      (nextPriority !== 1 && nextPriority !== 2 && nextPriority !== 3) ||
      nextPriority === todo.priority
    ) {
      return;
    }

    await saveTodoPatch(
      { priority: nextPriority as TodoPriority },
      { priority: nextPriority as TodoPriority },
    );
  };

  const updateDueDate = async (dateKey: string) => {
    if (!todo) {
      return;
    }

    const normalizedDateKey = dateKey.trim();
    const nextDueDate = normalizedDateKey
      ? dateKeyToTimestamp(normalizedDateKey)
      : null;
    if (normalizedDateKey && nextDueDate === null) {
      toast.error("Invalid due date.");
      return;
    }
    if ((todo.dueDate ?? null) === nextDueDate) {
      return;
    }

    await saveTodoPatch(
      { dueDate: nextDueDate },
      { dueDate: normalizedDateKey || null },
    );
  };

  const updateEstimatedHours = async (input: string) => {
    if (!todo) {
      return;
    }

    const nextEstimatedHours = parseEstimatedHoursInput(input);
    if (nextEstimatedHours === undefined) {
      toast.error(
        "duration must be between 15 minutes and 24 hours (for example: 15m, 1h, 1h 30m).",
      );
      return;
    }
    if (normalizeEstimatedHours(todo.estimatedHours) === nextEstimatedHours) {
      return;
    }

    await saveTodoPatch(
      { estimatedHours: nextEstimatedHours },
      { estimatedHours: nextEstimatedHours },
    );
  };

  const updateTimeBlockStart = async (value: string) => {
    if (!todo) {
      return;
    }

    const nextTimeBlockStart = value ? Number(value) : null;
    if (
      nextTimeBlockStart !== null &&
      (!Number.isInteger(nextTimeBlockStart) ||
        nextTimeBlockStart < 0 ||
        nextTimeBlockStart > 1439)
    ) {
      toast.error("Invalid time block.");
      return;
    }
    if ((todo.timeBlockStart ?? null) === nextTimeBlockStart) {
      return;
    }

    await saveTodoPatch(
      { timeBlockStart: nextTimeBlockStart },
      { timeBlockStart: nextTimeBlockStart },
    );
  };

  const updateRecurrence = async (nextRecurrence: TodoRecurrence) => {
    if (!todo || nextRecurrence === todo.recurrence) {
      return;
    }

    await saveTodoPatch(
      { recurrence: nextRecurrence },
      { recurrence: nextRecurrence },
    );
  };

  const deletePage = async () => {
    if (!todo || isDeleting) {
      return;
    }

    const previousTodo = todo;
    const previousTodos = await getCachedTodos().catch(() => []);
    setIsDeleting(true);
    setTodo(null);
    await setCachedTodos(previousTodos.filter((item) => item.id !== todo.id)).catch(
      () => undefined,
    );

    const queueDelete = async () => {
      await enqueueOfflineOperation({
        entity: "todo",
        entityId: previousTodo.id,
        kind: "delete",
        payload: {},
      });
    };

    try {
      if (!isOnline || previousTodo.id.startsWith("local-")) {
        await queueDelete();
        toast.message("todo delete queued offline");
        router.replace("/app");
        return;
      }

      await apiClient.deleteTodo(previousTodo.id);
      toast.message("todo deleted");
      router.replace("/app");
    } catch (error) {
      setTodo(previousTodo);
      await setCachedTodos(previousTodos).catch(() => undefined);
      toast.error(parseErrorMessage(error));
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
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

  const uploadEditorImage = async (
    file: File,
    onProgress?: (event: { progress: number }) => void,
    abortSignal?: AbortSignal,
  ) => {
    if (!todo) {
      throw new Error("Todo must be loaded before uploading images.");
    }
    if (!isOnline || todo.id.startsWith("local-")) {
      throw new Error("Save this todo online before adding editor images.");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error("Image must be 10 MB or smaller.");
    }
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files can be inserted.");
    }
    if (abortSignal?.aborted) {
      throw new Error("Upload cancelled.");
    }

    onProgress?.({ progress: 10 });
    const result = await apiClient.uploadAttachmentFile({
      parentKind: "todo",
      parentId: todo.id,
      file,
    });
    if (abortSignal?.aborted) {
      throw new Error("Upload cancelled.");
    }

    onProgress?.({ progress: 100 });
    await loadAttachments();
    return `/api/attachments/${encodeURIComponent(result.id)}/file`;
  };

  const publishPage = async () => {
    if (!todo) {
      return;
    }

    setIsPublishing(true);
    const payload = {
      sourceKind: "todo" as const,
      sourceId: todo.id,
      title: title.trim() || todo.title,
      notes: editorValue?.text ?? todo.notes,
      notesJson: editorValue?.json ?? todo.notesJson,
      visibility: "public" as const,
    };
    const queuePublish = async () => {
      await removeOfflineOperationsByEntity("publication", todo.id).catch(
        () => undefined,
      );
      await enqueueOfflineOperation({
        entity: "publication",
        entityId: todo.id,
        kind: "publish",
        payload,
      });
      toast.message(
        todo.id.startsWith("local-")
          ? "Bri publish queued until todo syncs"
          : "Bri publish queued offline",
      );
    };

    try {
      if (!isOnline || todo.id.startsWith("local-")) {
        await queuePublish();
        return;
      }

      const { publication: nextPublication } =
        await apiClient.publishToBri(payload);
      setPublication(nextPublication);
      toast.message(publication ? "Bri page updated" : "published to Bri");
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await queuePublish();
        return;
      }

      toast.error(parseErrorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const unpublishPage = async () => {
    if (!todo || !publication) {
      return;
    }

    setIsPublishing(true);
    const queueUnpublish = async () => {
      await removeOfflineOperationsByEntity("publication", todo.id).catch(
        () => undefined,
      );
      await enqueueOfflineOperation({
        entity: "publication",
        entityId: todo.id,
        kind: "delete",
        payload: {
          sourceKind: "todo",
          sourceId: todo.id,
        },
      });
      setPublication(null);
      toast.message("Bri unpublish queued offline");
    };

    try {
      if (!isOnline) {
        await queueUnpublish();
        return;
      }

      await apiClient.unpublishFromBri("todo", todo.id);
      setPublication(null);
      toast.message("unpublished from Bri");
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await queueUnpublish();
        return;
      }

      toast.error(parseErrorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const copyPublicationUrl = async () => {
    if (!publication) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publication.url);
      toast.message("Bri link copied");
    } catch {
      toast.error("could not copy link");
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
        const url = URL.createObjectURL(localAttachment.blob);
        if (isImageAttachment(attachment)) {
          setAttachmentPreview({ attachment, url, isBlobUrl: true });
          return;
        }

        window.open(url, "_blank", "noopener");
      }
      return;
    }

    const url = getAttachmentViewUrl(attachment);
    if (isImageAttachment(attachment)) {
      setAttachmentPreview({ attachment, url, isBlobUrl: false });
      return;
    }

    window.open(url, "_blank", "noopener");
  };

  const deleteAttachment = async (attachment: AttachmentRecord) => {
    const removeAttachmentLocally = async () => {
      await removeOfflineAttachment(attachment.id).catch(() => undefined);
      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
    };

    if (attachment.id.startsWith("local-attachment-")) {
      await removeOfflineOperationsByEntity("attachment", attachment.id).catch(
        () => undefined,
      );
      await removeAttachmentLocally();
      toast.message("attachment removed");
      return;
    }

    const queueDelete = async () => {
      await enqueueOfflineOperation({
        entity: "attachment",
        entityId: attachment.id,
        kind: "delete",
        payload: {
          parentKind: attachment.parentKind,
          parentId: attachment.parentId,
        },
      });
      await removeAttachmentLocally();
      toast.message("attachment delete queued offline");
    };

    if (!isOnline) {
      await queueDelete();
      return;
    }

    try {
      await apiClient.deleteAttachment(attachment.id);
      await removeAttachmentLocally();
      toast.message("attachment deleted");
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await queueDelete();
        return;
      }

      toast.error(parseErrorMessage(error));
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster />
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <Link href="/app" className="shrink-0 hover:text-foreground">
                ibx
              </Link>
              <span className="text-border">/</span>
              <span className="truncate lowercase text-foreground">
                {title || todo?.title || "todo"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {todo ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void savePage()}
                    disabled={isSaving}
                  >
                    {isSaving ? "saving" : "save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => attachmentInputRef.current?.click()}
                  >
                    {isUploading ? "attaching" : "attach"}
                  </Button>
                  {publication ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPublishing}
                      onClick={() => void publishPage()}
                    >
                      {isPublishing ? "publishing" : "publish"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-destructive hover:text-destructive"
                  >
                    delete
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-10 md:px-10 md:py-14">
          <input
            ref={attachmentInputRef}
            type="file"
            className="hidden"
            accept={ATTACHMENT_ACCEPT}
            onChange={(event) =>
              void handleAttachmentSelected(event.currentTarget.files)
            }
          />

          {isLoading && !todo ? (
            <p className="text-sm text-muted-foreground">loading page...</p>
          ) : todo ? (
            <article className="flex flex-1 flex-col gap-7">
              <div className="flex flex-col gap-4">
                <textarea
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-9 resize-none border-0 bg-transparent px-0 py-0 !text-lg font-semibold lowercase leading-tight tracking-normal shadow-none outline-none placeholder:text-muted-foreground/50 focus-visible:ring-0 md:!text-xl"
                  maxLength={140}
                  aria-label="Todo title"
                  rows={2}
                />

                <div className="grid gap-1 py-1 text-sm sm:grid-cols-[7rem_1fr]">
                  <label
                    className="self-center text-muted-foreground"
                    htmlFor="todo-status"
                  >
                    Status
                  </label>
                  <Combobox
                    items={STATUS_OPTIONS}
                    value={
                      STATUS_OPTIONS.find((option) => option.value === todo.status) ??
                      null
                    }
                    itemToStringValue={(option) => option.label}
                    onValueChange={(option) => {
                      if (option) {
                        void updateStatus(option.value);
                      }
                    }}
                  >
                    <ComboboxInput
                      id="todo-status"
                      className="w-32 border-0 bg-transparent shadow-none [&_[data-slot=input-group-control]]:text-sm"
                    />
                    <ComboboxContent className="border border-border">
                      <ComboboxEmpty>No status found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem key={option.value} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>

                  <label
                    className="self-center text-muted-foreground"
                    htmlFor="todo-priority"
                  >
                    Priority
                  </label>
                  <Combobox
                    items={PRIORITY_OPTIONS}
                    value={
                      PRIORITY_OPTIONS.find(
                        (option) => option.value === String(todo.priority),
                      ) ?? null
                    }
                    itemToStringValue={(option) => option.label}
                    onValueChange={(option) => {
                      if (option) {
                        void updatePriority(option.value);
                      }
                    }}
                  >
                    <ComboboxInput
                      id="todo-priority"
                      className="w-28 border-0 bg-transparent shadow-none [&_[data-slot=input-group-control]]:text-sm"
                    />
                    <ComboboxContent className="border border-border">
                      <ComboboxEmpty>No priority found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem key={option.value} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>

                  <label
                    className="self-center text-muted-foreground"
                    htmlFor="todo-due-date"
                  >
                    Due
                  </label>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          id="todo-due-date"
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-fit min-w-36 justify-start px-0 text-sm font-normal text-foreground hover:bg-muted"
                        />
                      }
                    >
                      {displayDate(todo.dueDate)}
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto gap-0 rounded-md p-1 shadow-none"
                    >
                      <Calendar
                        mode="single"
                        selected={
                          getTodoDateKey(todo.dueDate)
                            ? (dateKeyToLocalDate(getTodoDateKey(todo.dueDate)) ??
                              undefined)
                            : undefined
                        }
                        onSelect={(date) => {
                          void updateDueDate(date ? localDateToDateKey(date) : "");
                          setIsCalendarOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>

                  <label
                    className="self-center text-muted-foreground"
                    htmlFor="todo-estimate"
                  >
                    Estimate
                  </label>
                  <input
                    id="todo-estimate"
                    type="text"
                    defaultValue={formatEstimatedHoursInput(todo.estimatedHours)}
                    placeholder="15m / 1h"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void updateEstimatedHours(event.currentTarget.value);
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={(event) =>
                      void updateEstimatedHours(event.currentTarget.value)
                    }
                    className="h-8 w-32 rounded-md border-0 bg-transparent px-0 text-foreground outline-none placeholder:text-muted-foreground/60 hover:bg-muted focus-visible:bg-muted"
                  />

                  <label
                    className="self-center text-muted-foreground"
                    htmlFor="todo-time-block"
                  >
                    Time
                  </label>
                  <Combobox
                    items={TIME_BLOCK_OPTIONS}
                    value={
                      TIME_BLOCK_OPTIONS.find(
                        (option) =>
                          option.value ===
                          (todo.timeBlockStart === null
                            ? ""
                            : String(todo.timeBlockStart)),
                      ) ??
                      TIME_BLOCK_OPTIONS[0] ??
                      null
                    }
                    itemToStringValue={(option) => option.label}
                    onValueChange={(option) => {
                      if (option) {
                        void updateTimeBlockStart(option.value);
                      }
                    }}
                  >
                    <ComboboxInput
                      id="todo-time-block"
                      className="w-40 border-0 bg-transparent shadow-none [&_[data-slot=input-group-control]]:text-sm"
                    />
                    <ComboboxContent className="border border-border">
                      <ComboboxEmpty>No time found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem key={option.value || "none"} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>

                  <label
                    className="self-center text-muted-foreground"
                    htmlFor="todo-recurrence"
                  >
                    Repeat
                  </label>
                  <Combobox
                    items={RECURRENCE_OPTIONS}
                    value={
                      RECURRENCE_OPTIONS.find(
                        (option) => option.value === todo.recurrence,
                      ) ??
                      RECURRENCE_OPTIONS[0] ??
                      null
                    }
                    itemToStringValue={(option) => option.label}
                    onValueChange={(option) => {
                      if (option) {
                        void updateRecurrence(option.value);
                      }
                    }}
                  >
                    <ComboboxInput
                      id="todo-recurrence"
                      className="w-32 border-0 bg-transparent shadow-none [&_[data-slot=input-group-control]]:text-sm"
                    />
                    <ComboboxContent className="border border-border">
                      <ComboboxEmpty>No repeat found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option) => (
                          <ComboboxItem key={option.value} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
              </div>

              <section className="min-h-[44vh] flex-1">
                <SimpleEditor
                  value={resolvedEditorValue}
                  embedded
                  autoFocus
                  placeholder="Write notes, type / for blocks"
                  imageUpload={uploadEditorImage}
                  onChange={(value) => setEditorValue(value)}
                />
              </section>

              <section className="flex flex-col gap-4 pt-5">
                {publication ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>Published to Bri</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(publication.url, "_blank", "noopener")
                      }
                    >
                      open Bri
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void copyPublicationUrl()}
                    >
                      copy link
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isPublishing}
                      onClick={() => void unpublishPage()}
                    >
                      unpublish
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                    Files
                  </div>
                  {attachments.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="group flex min-h-14 items-center gap-3 rounded-md border border-border/50 bg-muted/20 p-2 text-sm transition-colors hover:bg-muted/60"
                        >
                          <button
                            type="button"
                            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background text-[0.65rem] font-medium text-muted-foreground"
                            onClick={() => void openAttachment(attachment)}
                            aria-label={`Preview ${attachment.fileName}`}
                          >
                            {isImageAttachment(attachment) &&
                            !attachment.id.startsWith("local-attachment-") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={getAttachmentViewUrl(attachment)}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              getAttachmentKindLabel(attachment)
                            )}
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => void openAttachment(attachment)}
                          >
                            <span className="block truncate text-foreground underline-offset-2 group-hover:underline">
                              {attachment.fileName}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {getAttachmentKindLabel(attachment)} /{" "}
                              {formatBytes(attachment.size)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-1 text-xs text-muted-foreground opacity-100 hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                            onClick={() => void deleteAttachment(attachment)}
                            aria-label={`Delete ${attachment.fileName}`}
                          >
                            delete
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No files</p>
                  )}
                </div>
              </section>
            </article>
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
      </div>
      <Dialog
        open={Boolean(attachmentPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setAttachmentPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-[min(56rem,calc(100%-2rem))] gap-3 p-3 sm:max-w-3xl">
          <DialogHeader className="pe-8">
            <DialogTitle className="truncate text-sm">
              {attachmentPreview?.attachment.fileName ?? "Image"}
            </DialogTitle>
            <DialogDescription>
              {attachmentPreview
                ? `${getAttachmentKindLabel(attachmentPreview.attachment)} / ${formatBytes(
                    attachmentPreview.attachment.size,
                  )}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {attachmentPreview ? (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachmentPreview.url}
                alt={attachmentPreview.attachment.fileName}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle>Delete todo?</DialogTitle>
            <DialogDescription>
              This removes the todo from IBX. Published Bri pages can be
              unpublished separately if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deletePage()}
              disabled={isDeleting}
            >
              {isDeleting ? "deleting" : "delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
