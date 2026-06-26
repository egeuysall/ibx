"use client";

import { useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
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
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SidebarAccount } from "@/components/layout/sidebar-account";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useTheme } from "@/hooks/useTheme";
import { UNAUTHORIZED_EVENT_NAME, apiClient, ApiError } from "@/lib/apiClient";
import {
  addQueuedPrompt,
  getCachedTodos,
  listQueuedPrompts,
  patchQueuedPrompt,
  removeQueuedPrompt,
  setCachedTodos,
} from "@/lib/indexedDb";
import {
  enqueueOfflineOperation,
  getOfflineAttachment,
  listOfflineAttachments,
  listPendingOfflineOperations,
  migrateOfflineTodoReferences,
  patchOfflineAttachment,
  patchOfflineOperation,
  removeOfflineAttachment,
  removeOfflineOperation,
  removeOfflineOperationsByEntity,
  upsertManyOfflineAttachments,
  upsertOfflineConflictRecovery,
  upsertOfflineTodoCreateOperation,
  type OfflineAttachment,
} from "@/lib/offline/db";
import { flushPendingPublicationOperations } from "@/lib/offline/publication-sync";
import {
  getTodoLinksInputValue,
  getTodoResourceLinks,
  parseTodoLinksInput,
  stripTodoLinksFromNotes,
  type TodoResourceLink,
} from "@/lib/todo-links";
import { getTodoPageHref } from "@/lib/todo-slug";
import { cn } from "@/lib/utils";
import type {
  AttachmentRecord,
  GenerationPreferences,
  TodoItem,
  TodoPriority,
  TodoRecurrence,
} from "@/lib/types";

type AppShellProps = {
  initialAuthenticated: boolean;
  initialFilter?: TodoFilter;
};
type UnauthorizedEventDetail = {
  message?: string;
};

type TodoPatch = Partial<
  Pick<
    TodoItem,
    | "title"
    | "notes"
    | "notesJson"
    | "notesHtml"
    | "status"
    | "dueDate"
    | "estimatedHours"
    | "timeBlockStart"
    | "recurrence"
    | "priority"
  >
>;

type TodoApiPatch = {
  status?: TodoItem["status"];
  dueDate?: string | null;
  estimatedHours?: number | null;
  timeBlockStart?: number | null;
  recurrence?: TodoItem["recurrence"];
  priority?: TodoItem["priority"];
  title?: string;
  notes?: string | null;
  notesJson?: unknown;
  notesHtml?: string | null;
};

const PROMPT_INPUT_STORAGE_KEY = "ibx:prompt-input";
const FILTER_STORAGE_KEY = "ibx:active-view";
const PROMPT_AUTOFOCUS_STORAGE_KEY = "ibx:prompt-autofocus";
const TIME_BLOCK_NOTIFICATIONS_STORAGE_KEY = "ibx:time-block-notifications";
const ZEN_MODE_STORAGE_KEY = "ibx:zen-mode";
const SYNC_CLIENT_ID_STORAGE_KEY = "ibx:sync-client-id";
const AI_AVAILABILITY_NOTES_STORAGE_KEY = "ibx:ai-availability-notes";
const DEFAULT_AVAILABILITY_NOTES =
  "Mon-Tue unavailable before 6:00 PM. Wed-Fri unavailable before 5:00 PM. Sunday avoid 11:00 AM-12:00 PM and 7:00-8:00 PM. Hard stop at 10:30 PM daily. I execute about 4x faster than average, but only use 15-30 minutes for truly quick admin tasks; deep work should usually stay 45-120 minutes.";
const DEFAULT_EXECUTION_SPEED_MULTIPLIER = 4;
const SHORTCUT_CAPTURE_KEY_PREFIX = "ibx:shortcut-capture:";
const LOCAL_MANUAL_THOUGHT_ID = "local-manual";
const NOTE_PREVIEW_LENGTH = 160;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_PRESTART_MS = 5 * 60 * 1000;
const NOTIFICATION_LATE_GRACE_MS = 2 * 60 * 1000;
const HOLD_PROGRESS_DELAY_MS = 160;
const HOLD_PROGRESS_SWEEP_MS = 300;
const HOLD_TO_TOGGLE_MS = HOLD_PROGRESS_DELAY_MS + HOLD_PROGRESS_SWEEP_MS;
const HOLD_MOVE_CANCEL_PX = 24;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UTC_LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const UTC_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});
const TIME_BLOCK_CLOCK_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}`;
  const date = new Date(2020, 0, 1, hours, minutes, 0, 0);
  const label = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return { value, label: label.toLowerCase() };
});

function normalizeAvailabilityNotes(value: string | null | undefined) {
  const base = value?.trim()?.slice(0, 640) || DEFAULT_AVAILABILITY_NOTES;
  if (/\b10:30\b|\b22:30\b/i.test(base)) {
    return base;
  }

  return `${base}${base.endsWith(".") ? "" : "."} Hard stop at 10:30 PM daily.`;
}

function getNearestQuarterHourIndex(date: Date) {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();
  const roundedQuarter = Math.round(totalMinutes / 15);
  return Math.min(95, Math.max(0, roundedQuarter));
}

function scrollTimeComboboxNearCurrentTime() {
  if (typeof document === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const popup =
        document.querySelector<HTMLElement>(
          '[data-slot="combobox-content"][data-time-block-combobox="1"][data-open]',
        ) ??
        document.querySelector<HTMLElement>(
          '[data-slot="combobox-content"][data-time-block-combobox="1"]',
        );
      if (!popup) {
        return;
      }

      const items = popup.querySelectorAll<HTMLElement>(
        '[data-slot="combobox-item"]',
      );
      if (items.length === 0) {
        return;
      }

      const targetIndex = Math.min(
        items.length - 1,
        getNearestQuarterHourIndex(new Date()),
      );
      items[targetIndex]?.scrollIntoView({
        block: "center",
      });
    });
  });
}

function readStoredPromptInput() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(PROMPT_INPUT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function readStoredFilter() {
  if (typeof window === "undefined") {
    return "today" as TodoFilter;
  }

  try {
    return normalizeFilter(window.localStorage.getItem(FILTER_STORAGE_KEY));
  } catch {
    return "today" as TodoFilter;
  }
}

function readStoredPromptAutofocus() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(PROMPT_AUTOFOCUS_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function readStoredTimeBlockNotifications() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return (
      window.localStorage.getItem(TIME_BLOCK_NOTIFICATIONS_STORAGE_KEY) !== "0"
    );
  } catch {
    return true;
  }
}

function readStoredZenMode() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(ZEN_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readStoredGenerationPreferences(): GenerationPreferences {
  if (typeof window === "undefined") {
    return {
      autoSchedule: true,
      includeRelevantLinks: true,
      requireTaskDescriptions: true,
      availabilityNotes: DEFAULT_AVAILABILITY_NOTES,
      executionSpeedMultiplier: DEFAULT_EXECUTION_SPEED_MULTIPLIER,
    };
  }

  try {
    const availabilityNotes = window.localStorage.getItem(
      AI_AVAILABILITY_NOTES_STORAGE_KEY,
    );
    return {
      autoSchedule: true,
      includeRelevantLinks: true,
      requireTaskDescriptions: true,
      availabilityNotes: normalizeAvailabilityNotes(availabilityNotes),
      executionSpeedMultiplier: DEFAULT_EXECUTION_SPEED_MULTIPLIER,
    };
  } catch {
    return {
      autoSchedule: true,
      includeRelevantLinks: true,
      requireTaskDescriptions: true,
      availabilityNotes: DEFAULT_AVAILABILITY_NOTES,
      executionSpeedMultiplier: DEFAULT_EXECUTION_SPEED_MULTIPLIER,
    };
  }
}

function getLocalDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodoDateKey(timestamp: number | null) {
  if (typeof timestamp !== "number") {
    return null;
  }

  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTodoOnDateKey(timestamp: number | null, dateKey: string) {
  return getTodoDateKey(timestamp) === dateKey;
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

function formatDateKey(dateKey: string, formatter: Intl.DateTimeFormat) {
  if (!ISO_DATE_REGEX.test(dateKey)) {
    return "no date";
  }

  const timestamp = dateKeyToTimestamp(dateKey);
  if (timestamp === null) {
    return "no date";
  }

  return formatter.format(new Date(timestamp));
}

function displayDueDate(timestamp: number | null) {
  const dateKey = getTodoDateKey(timestamp);
  if (!dateKey) {
    return "no date";
  }

  return formatDateKey(dateKey, UTC_LONG_DATE_FORMATTER);
}

function displayDateInputValue(timestamp: number | null) {
  const dateKey = getTodoDateKey(timestamp);
  if (!dateKey) {
    return "mm/dd/yyyy";
  }

  return formatDateKey(dateKey, UTC_SHORT_DATE_FORMATTER);
}

function parseErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

function toastApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return;
  }

  toast.error(parseErrorMessage(error));
}

function readOrCreateSyncClientId() {
  if (typeof window === "undefined") {
    return "server";
  }

  try {
    const existing = window.localStorage.getItem(SYNC_CLIENT_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const nextValue = crypto.randomUUID();
    window.localStorage.setItem(SYNC_CLIENT_ID_STORAGE_KEY, nextValue);
    return nextValue;
  } catch {
    return crypto.randomUUID();
  }
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

      if (unit.startsWith("h")) {
        totalMinutes += value * 60;
      } else {
        totalMinutes += value;
      }
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

function displayEstimatedHours(hours: number | null | undefined) {
  const formatted = formatEstimatedHoursInput(hours);
  if (!formatted) {
    return "hours: unsized";
  }

  return `hours: ${formatted}`;
}

function sumEstimatedHours(todos: TodoItem[]) {
  return todos.reduce((total, todo) => {
    const estimatedHours = normalizeEstimatedHours(todo.estimatedHours);
    return total + (estimatedHours ?? 0);
  }, 0);
}

function displayTimeBlock(
  timestamp: number | null,
  estimatedHours: number | null,
) {
  if (typeof timestamp !== "number") {
    return "block: unscheduled";
  }

  const startDate = new Date(timestamp);
  const endDate = new Date(
    timestamp + (normalizeEstimatedHours(estimatedHours) ?? 1) * 60 * 60 * 1000,
  );

  const startLabel = startDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = endDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `block: ${startLabel.toLowerCase()} - ${endLabel.toLowerCase()}`;
}

function displayZenTimeBlock(
  timestamp: number | null,
  estimatedHours: number | null,
) {
  if (typeof timestamp !== "number") {
    return "unscheduled";
  }

  const startDate = new Date(timestamp);
  const endDate = new Date(
    timestamp + (normalizeEstimatedHours(estimatedHours) ?? 1) * 60 * 60 * 1000,
  );

  const startLabel = startDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = endDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${startLabel.toLowerCase()} - ${endLabel.toLowerCase()}`;
}

function displayZenTaskMeta(todo: TodoItem) {
  const duration = formatEstimatedHoursInput(todo.estimatedHours) || "unsized";
  return `${duration} // ${displayZenTimeBlock(
    todo.timeBlockStart,
    todo.estimatedHours,
  )}`;
}

function displayTimeBlockClockValue(timestamp: number | null) {
  if (typeof timestamp !== "number") {
    return "";
  }

  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function compareByPriorityAndStartTime(left: TodoItem, right: TodoItem) {
  const leftPriority = normalizeTodoPriority(left.priority);
  const rightPriority = normalizeTodoPriority(right.priority);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftStart = left.timeBlockStart ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.timeBlockStart ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  const leftDueDate = left.dueDate ?? Number.MAX_SAFE_INTEGER;
  const rightDueDate = right.dueDate ?? Number.MAX_SAFE_INTEGER;
  if (leftDueDate !== rightDueDate) {
    return leftDueDate - rightDueDate;
  }

  return right.createdAt - left.createdAt;
}

function displayRecurrence(recurrence: TodoRecurrence) {
  if (recurrence === "none") {
    return "once";
  }

  return recurrence;
}

function normalizeTodoPriority(
  priority: number | null | undefined,
): TodoPriority {
  if (priority === 1 || priority === 3) {
    return priority;
  }

  return 2;
}

function displayPriority(priority: number) {
  return `p${normalizeTodoPriority(priority)}`;
}

function getPreviewNotes(notes: string) {
  if (notes.length <= NOTE_PREVIEW_LENGTH) {
    return notes;
  }

  return `${notes.slice(0, NOTE_PREVIEW_LENGTH)}…`;
}

type TodoDisplayMeta = {
  description: string | null;
  descriptionPreview: string | null;
  links: TodoResourceLink[];
  linksInputValue: string;
};

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

function buildTodoNotesWithLinks(description: string | null, links: string[]) {
  const parts: string[] = [];
  if (description) {
    parts.push(description);
  }
  if (links.length > 0) {
    parts.push(links.join(" "));
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n");
}

function areStringListsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

function getTodoDisplayMeta(notes: string | null): TodoDisplayMeta {
  const links = getTodoResourceLinks(notes);
  const description = stripTodoLinksFromNotes(notes);

  return {
    description,
    descriptionPreview: description ? getPreviewNotes(description) : null,
    links,
    linksInputValue: links.map((link) => link.url).join(", "),
  };
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "button, input, select, textarea, a, [contenteditable='true'], [role='button'], [data-hold-ignore='true']",
    ),
  );
}

function sortTodos(todos: TodoItem[]) {
  return [...todos].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "open" ? -1 : 1;
    }

    const aPriority = normalizeTodoPriority(a.priority);
    const bPriority = normalizeTodoPriority(b.priority);

    if (a.status === "open" && b.status === "open" && aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aDueDate = a.dueDate ?? Number.MAX_SAFE_INTEGER;
    const bDueDate = b.dueDate ?? Number.MAX_SAFE_INTEGER;

    if (aDueDate !== bDueDate) {
      return aDueDate - bDueDate;
    }

    return b.createdAt - a.createdAt;
  });
}

function createLocalManualTodo(title: string): TodoItem {
  const now = Date.now();
  const todayDateKey = getLocalDateKey(now);

  return {
    id: `local-${crypto.randomUUID()}`,
    thoughtId: LOCAL_MANUAL_THOUGHT_ID,
    title,
    notes: null,
    notesJson: null,
    notesHtml: null,
    status: "open",
    dueDate: dateKeyToTimestamp(todayDateKey),
    estimatedHours: null,
    timeBlockStart: null,
    priority: 1,
    recurrence: "none",
    source: "manual",
    createdAt: now,
  };
}

function getStartOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function getRelativeDayLabel(dateKey: string, now: number) {
  if (!ISO_DATE_REGEX.test(dateKey)) {
    return null;
  }

  const targetDate = dateKeyToLocalDate(dateKey);
  if (!targetDate) {
    return null;
  }

  const targetStart = targetDate.getTime();
  const todayStart = getStartOfLocalDay(now);
  const diffDays = Math.round((targetStart - todayStart) / DAY_MS);

  if (diffDays === 0) {
    return "today";
  }

  if (diffDays === 1) {
    return "tomorrow";
  }

  if (diffDays === -1) {
    return "yesterday";
  }

  if (diffDays > 1) {
    return `in ${diffDays}d`;
  }

  return `${Math.abs(diffDays)}d ago`;
}

function formatSectionDateLabel(
  dateKey: string | null,
  filter: TodoFilter,
  now: number,
) {
  if (dateKey === null) {
    return "no date";
  }

  const formattedDate = formatDateKey(dateKey, UTC_SHORT_DATE_FORMATTER);
  if (filter !== "upcoming" && filter !== "archive") {
    return formattedDate;
  }

  const relativeLabel = getRelativeDayLabel(dateKey, now);
  return relativeLabel ? `${formattedDate} // ${relativeLabel}` : formattedDate;
}

function formatSectionHoursLabel(todos: TodoItem[]) {
  const totalHours = sumEstimatedHours(todos);
  if (totalHours <= 0) {
    return "unsized";
  }

  return formatEstimatedHoursInput(totalHours);
}

type TodoFilter = "zen" | "today" | "upcoming" | "archive";
type TodoSection = {
  key: string;
  label: string | null;
  todos: TodoItem[];
};

type ShortcutPayload = {
  text: string;
  source: "app" | "shortcut";
  captureId: string | null;
};

const TODAY_PRIORITY_LABELS: Record<TodoPriority, string> = {
  1: "p1 // must-do",
  2: "p2 // should-do",
  3: "p3 // could-do",
};

function normalizeFilter(value: string | null | undefined): TodoFilter {
  if (value === "zen" || value === "upcoming" || value === "archive") {
    return value;
  }

  return "today";
}

function readHashParams(hash: string) {
  if (!hash.startsWith("#") || hash.length <= 1) {
    return new URLSearchParams();
  }

  return new URLSearchParams(hash.slice(1));
}

function decodePathShortcutPayload(pathname: string) {
  const match = pathname.match(/^\/capture\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const [, rawCaptureId, rawText] = match;

  try {
    return {
      captureId: decodeURIComponent(rawCaptureId),
      text: decodeURIComponent(rawText),
    };
  } catch {
    return null;
  }
}

function readShortcutPayloadFromLocation(
  location: Location,
): ShortcutPayload | null {
  const url = new URL(location.href);
  const hashParams = readHashParams(url.hash);
  const pathPayload = decodePathShortcutPayload(url.pathname);

  const text =
    url.searchParams.get("shortcut") ??
    hashParams.get("shortcut") ??
    pathPayload?.text ??
    null;

  if (!text) {
    return null;
  }

  const sourceParam =
    url.searchParams.get("source") ?? hashParams.get("source");
  const captureId =
    url.searchParams.get("captureId") ??
    hashParams.get("captureId") ??
    pathPayload?.captureId ??
    null;

  return {
    text,
    source: sourceParam === "shortcut" ? "shortcut" : "app",
    captureId,
  };
}

function clearShortcutPayloadFromLocation(
  location: Location,
  fallbackFilter: TodoFilter,
) {
  const url = new URL(location.href);
  const hashParams = readHashParams(url.hash);

  url.searchParams.delete("shortcut");
  url.searchParams.delete("source");
  url.searchParams.delete("captureId");
  url.searchParams.delete("ts");

  hashParams.delete("shortcut");
  hashParams.delete("source");
  hashParams.delete("captureId");
  hashParams.delete("ts");

  if (url.pathname.startsWith("/capture/")) {
    url.pathname = "/app";
  }

  if (!url.searchParams.get("view")) {
    url.searchParams.set("view", fallbackFilter);
  }

  const hashText = hashParams.toString();
  url.hash = hashText ? `#${hashText}` : "";

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

export function AppShell({
  initialAuthenticated,
  initialFilter = "today",
}: AppShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut } = useClerk();
  useTheme();
  const isOnline = useOfflineStatus();

  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [filter, setFilter] = useState<TodoFilter>(initialFilter);
  const [timeBlockNotificationsEnabled, setTimeBlockNotificationsEnabled] =
    useState(false);
  const [zenModeEnabled, setZenModeEnabled] = useState(false);
  const pushUpdatesEnabled = true;
  const [promptInput, setPromptInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isTerminalRendered, setIsTerminalRendered] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    "ibx terminal ready. type help or ls.",
  ]);
  const [promptAutofocus, setPromptAutofocus] = useState(false);
  const [hasHydratedPreferences, setHasHydratedPreferences] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [hasLoadedTodos, setHasLoadedTodos] = useState(false);
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [queuedPromptCount, setQueuedPromptCount] = useState(0);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [justCompletedZenTodoId, setJustCompletedZenTodoId] = useState<
    string | null
  >(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTitleInput, setEditingTitleInput] = useState("");
  const [editingLinksInput, setEditingLinksInput] = useState("");
  const [holdingTodoId, setHoldingTodoId] = useState<string | null>(null);
  const [todoPendingDelete, setTodoPendingDelete] = useState<TodoItem | null>(
    null,
  );
  const [isArchiveCleanupOpen, setIsArchiveCleanupOpen] = useState(false);
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [expandedNoteIds, setExpandedNoteIds] = useState<
    Record<string, boolean>
  >({});
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const terminalOpenTimerRef = useRef<number | null>(null);
  const terminalCloseTimerRef = useRef<number | null>(null);
  const hasAppliedInitialAutofocus = useRef(false);
  const isQueueFlushRunning = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdAnimationFrameRef = useRef<number | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const heldTodoIdRef = useRef<string | null>(null);
  const suppressNextClickRef = useRef(false);
  const isShortcutConsumeRunning = useRef(false);
  const lastUnauthorizedToastAtRef = useRef(0);
  const notifiedTimeBlocksRef = useRef<Set<string>>(new Set());

  const clearTerminalCloseTimer = useCallback(() => {
    if (terminalCloseTimerRef.current !== null) {
      window.clearTimeout(terminalCloseTimerRef.current);
      terminalCloseTimerRef.current = null;
    }
  }, []);

  const clearTerminalOpenTimer = useCallback(() => {
    if (terminalOpenTimerRef.current !== null) {
      window.clearTimeout(terminalOpenTimerRef.current);
      terminalOpenTimerRef.current = null;
    }
  }, []);

  const openTerminal = useCallback(() => {
    clearTerminalCloseTimer();
    clearTerminalOpenTimer();
    setIsTerminalOpen(false);
    setIsTerminalRendered(true);
    terminalOpenTimerRef.current = window.setTimeout(() => {
      setIsTerminalOpen(true);
      terminalOpenTimerRef.current = null;
    }, 32);
  }, [clearTerminalCloseTimer, clearTerminalOpenTimer]);

  const closeTerminal = useCallback(() => {
    clearTerminalOpenTimer();
    setIsTerminalOpen(false);
    clearTerminalCloseTimer();
    terminalCloseTimerRef.current = window.setTimeout(() => {
      setIsTerminalRendered(false);
      terminalCloseTimerRef.current = null;
    }, 360);
  }, [clearTerminalCloseTimer, clearTerminalOpenTimer]);

  const toggleTerminal = useCallback(() => {
    if (isTerminalOpen || isTerminalRendered) {
      closeTerminal();
    } else {
      openTerminal();
    }
  }, [closeTerminal, isTerminalOpen, isTerminalRendered, openTerminal]);

  useEffect(
    () => () => {
      clearTerminalOpenTimer();
      clearTerminalCloseTimer();
    },
    [clearTerminalCloseTimer, clearTerminalOpenTimer],
  );

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearHoldAnimation = useCallback(() => {
    if (holdAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(holdAnimationFrameRef.current);
      holdAnimationFrameRef.current = null;
    }

    holdStartedAtRef.current = null;
    setHoldingTodoId(null);
    setHoldProgress(0);
  }, []);

  const cancelHoldInteraction = useCallback(() => {
    clearHoldTimer();
    clearHoldAnimation();
    holdStartRef.current = null;
    heldTodoIdRef.current = null;
  }, [clearHoldAnimation, clearHoldTimer]);

  useEffect(() => {
    setFilter(readStoredFilter());
    setTimeBlockNotificationsEnabled(readStoredTimeBlockNotifications());
    setZenModeEnabled(readStoredZenMode());
    setPromptInput(readStoredPromptInput());
    setPromptAutofocus(readStoredPromptAutofocus());
    setHasHydratedPreferences(true);
  }, []);

  useEffect(
    () => () => {
      cancelHoldInteraction();
    },
    [cancelHoldInteraction],
  );

  useEffect(() => {
    if (!editingTodoId) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      // Keep the edit panel open while interacting with the active row
      // or with portal-based popovers/calendar content.
      const insideActiveRow = Boolean(
        target.closest(`[data-todo-article-id="${editingTodoId}"]`),
      );
      const insideOverlay = Boolean(
        target.closest("[data-radix-popper-content-wrapper]") ||
          target.closest("[data-slot='combobox-content']") ||
          target.closest("[data-slot='popover-content']") ||
          target.closest("[data-slot='calendar']") ||
          target.closest("[data-slot='popover-trigger']"),
      );

      if (insideActiveRow || insideOverlay) {
        return;
      }

      setEditingTodoId(null);
      setEditingTitleInput("");
      setEditingLinksInput("");
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [editingTodoId]);

  useEffect(() => {
    if (!hasHydratedPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(PROMPT_INPUT_STORAGE_KEY, promptInput);
    } catch {
      // Ignore localStorage failures (private mode, blocked storage)
    }
  }, [hasHydratedPreferences, promptInput]);

  useEffect(() => {
    if (!hasHydratedPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      // Ignore localStorage failures (private mode, blocked storage)
    }
  }, [filter, hasHydratedPreferences]);

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      if (!isAuthenticated) {
        return;
      }

      const unauthorizedEvent = event as CustomEvent<UnauthorizedEventDetail>;
      setIsAuthenticated(false);
      setHasLoadedTodos(false);
      setTodos([]);
      setQueuedPromptCount(0);

      const now = Date.now();
      if (now - lastUnauthorizedToastAtRef.current >= 1_500) {
        lastUnauthorizedToastAtRef.current = now;
        toast.error(
          unauthorizedEvent.detail?.message ??
            "Session expired. Sign in again.",
        );
      }

      void signOut({ redirectUrl: "/" }).catch(() => {
        router.replace("/");
        router.refresh();
      });
    };

    window.addEventListener(
      UNAUTHORIZED_EVENT_NAME,
      onUnauthorized as EventListener,
    );
    return () =>
      window.removeEventListener(
        UNAUTHORIZED_EVENT_NAME,
        onUnauthorized as EventListener,
      );
  }, [isAuthenticated, router, signOut]);

  const refreshTodos = useCallback(
    async (showLoading = false) => {
      if (!isAuthenticated) {
        return;
      }

      if (!isOnline) {
        return;
      }

      if (showLoading) {
        setIsLoadingTodos(true);
      }

      try {
        const { todos: nextTodos } = await apiClient.listAllTodos();
        setTodos(sortTodos(nextTodos));
        setHasLoadedTodos(true);
      } catch (error) {
        toastApiError(error);
      } finally {
        if (showLoading) {
          setIsLoadingTodos(false);
        }
      }
    },
    [isAuthenticated, isOnline],
  );

  const refreshQueuedPromptCount = useCallback(async () => {
    try {
      const queue = await listQueuedPrompts();
      setQueuedPromptCount(queue.length);
    } catch {
      // Ignore queue read failures to keep UI responsive.
    }
  }, []);

  const loadTodoAttachments = useCallback(
    async (todoId: string) => {
      await listOfflineAttachments("todo", todoId).catch(() => []);

      if (!isAuthenticated || !isOnline || todoId.startsWith("local-")) {
        return;
      }

      try {
        const { attachments } = await apiClient.listAttachments("todo", todoId);
        await upsertManyOfflineAttachments(
          attachments.map(offlineAttachmentFromRecord),
        );
      } catch (error) {
        if (!(error instanceof ApiError && error.isNetworkError)) {
          toastApiError(error);
        }
      }
    },
    [isAuthenticated, isOnline],
  );

  const queuePrompt = useCallback(
    async (text: string, source: "app" | "shortcut") => {
      const cleanInput = text.trim().slice(0, 8_000);
      if (!cleanInput) {
        return null;
      }

      const queued = await addQueuedPrompt({
        text: cleanInput,
        source,
      });
      setQueuedPromptCount((previous) => previous + 1);
      return queued.id;
    },
    [],
  );

  const flushQueuedPrompts = useCallback(async () => {
    if (!isAuthenticated || !isOnline || isQueueFlushRunning.current) {
      return;
    }

    isQueueFlushRunning.current = true;
    setIsProcessingQueue(true);

    try {
      const queue = await listQueuedPrompts();
      setQueuedPromptCount(queue.length);

      if (queue.length === 0) {
        return;
      }

      let createdTodos = 0;
      let updatedTodos = 0;
      let deletedTodos = 0;
      let failedItems = 0;
      let pausedForNetwork = false;

      for (const item of queue) {
        const nextAttempts = item.attempts + 1;
        await patchQueuedPrompt(item.id, {
          status: "processing",
          attempts: nextAttempts,
          lastError: null,
        });

        try {
          const result = await apiClient.generateTodosFromInput(
            item.text,
            readStoredGenerationPreferences(),
          );
          createdTodos += result.created;
          updatedTodos += result.updated ?? 0;
          deletedTodos += result.deleted ?? 0;
          await removeQueuedPrompt(item.id);
        } catch (error) {
          if (error instanceof ApiError && error.isNetworkError) {
            pausedForNetwork = true;
            await patchQueuedPrompt(item.id, {
              status: "pending",
              attempts: nextAttempts,
              lastError: parseErrorMessage(error),
            });
            break;
          }

          failedItems += 1;
          await patchQueuedPrompt(item.id, {
            status: "failed",
            attempts: nextAttempts,
            lastError: parseErrorMessage(error),
          });
        }
      }

      await refreshQueuedPromptCount();

      if (createdTodos > 0 || updatedTodos > 0 || deletedTodos > 0) {
        toast.message(
          `ai applied queued changes: +${createdTodos} / ~${updatedTodos} / -${deletedTodos}`,
        );
      }

      if (failedItems > 0) {
        toast.error(
          `${failedItems} queued item${failedItems === 1 ? "" : "s"} failed`,
        );
      } else if (pausedForNetwork) {
        toast.message("network unavailable. queued items stay saved offline.");
      }

      await refreshTodos();
    } finally {
      isQueueFlushRunning.current = false;
      setIsProcessingQueue(false);
    }
  }, [isAuthenticated, isOnline, refreshQueuedPromptCount, refreshTodos]);

  const flushPendingAttachmentOperations = useCallback(async () => {
    if (!isAuthenticated || !isOnline) {
      return { uploaded: 0, deleted: 0, paused: false };
    }

    const pendingOperations = await listPendingOfflineOperations(50).catch(
      () => [],
    );
    const attachmentOperations = pendingOperations.filter(
      (operation) =>
        operation.entity === "attachment" &&
        (operation.kind === "upload" || operation.kind === "delete"),
    );

    let uploaded = 0;
    let deleted = 0;
    let paused = false;

    for (const operation of attachmentOperations) {
      if (operation.kind === "delete") {
        if (operation.entityId.startsWith("local-attachment-")) {
          await removeOfflineAttachment(operation.entityId).catch(() => undefined);
          await removeOfflineOperation(operation.id).catch(() => undefined);
          deleted += 1;
          continue;
        }

        try {
          await apiClient.deleteAttachment(operation.entityId);
          await removeOfflineAttachment(operation.entityId).catch(() => undefined);
          await removeOfflineOperation(operation.id).catch(() => undefined);
          deleted += 1;
        } catch (error) {
          if (error instanceof ApiError && error.isNetworkError) {
            paused = true;
            await patchOfflineOperation(operation.id, {
              attempts: operation.attempts + 1,
              lastError: parseErrorMessage(error),
            }).catch(() => undefined);
            break;
          }

          if (error instanceof ApiError && error.status === 404) {
            await removeOfflineAttachment(operation.entityId).catch(
              () => undefined,
            );
            await removeOfflineOperation(operation.id).catch(() => undefined);
            deleted += 1;
            continue;
          }

          await patchOfflineOperation(operation.id, {
            attempts: operation.attempts + 1,
            lastError: parseErrorMessage(error),
          }).catch(() => undefined);
        }
        continue;
      }

      const payload =
        operation.payload && typeof operation.payload === "object"
          ? (operation.payload as Record<string, unknown>)
          : {};
      const parentKind =
        payload.parentKind === "todo" || payload.parentKind === "thought"
          ? payload.parentKind
          : null;
      const parentId =
        typeof payload.parentId === "string" ? payload.parentId : null;

      if (!parentKind || !parentId || parentId.startsWith("local-")) {
        continue;
      }

      const attachment = await getOfflineAttachment(operation.entityId).catch(
        () => null,
      );
      if (!attachment?.blob) {
        await patchOfflineOperation(operation.id, {
          attempts: operation.attempts + 1,
          lastError: "Missing offline file blob.",
        }).catch(() => undefined);
        await patchOfflineAttachment(operation.entityId, {
          status: "error",
          lastError: "Missing offline file blob.",
        }).catch(() => undefined);
        continue;
      }

      await patchOfflineAttachment(operation.entityId, {
        status: "uploading",
        lastError: null,
      }).catch(() => undefined);

      try {
        const file =
          attachment.blob instanceof File
            ? attachment.blob
            : new File([attachment.blob], attachment.fileName, {
                type: attachment.contentType,
              });
        const { id } = await apiClient.uploadAttachmentFile({
          parentKind,
          parentId,
          file,
        });
        await patchOfflineAttachment(operation.entityId, {
          storageId: id,
          status: "uploaded",
          blob: undefined,
          lastError: null,
        });
        await removeOfflineAttachment(operation.entityId);
        await removeOfflineOperation(operation.id);
        await loadTodoAttachments(parentId);
        uploaded += 1;
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError) {
          paused = true;
          await patchOfflineAttachment(operation.entityId, {
            status: "local",
            lastError: parseErrorMessage(error),
          }).catch(() => undefined);
          break;
        }

        const message = parseErrorMessage(error);
        await patchOfflineOperation(operation.id, {
          attempts: operation.attempts + 1,
          lastError: message,
        }).catch(() => undefined);
        await patchOfflineAttachment(operation.entityId, {
          status: "error",
          lastError: message,
        }).catch(() => undefined);
      }
    }

    return { uploaded, deleted, paused };
  }, [isAuthenticated, isOnline, loadTodoAttachments]);

  const flushPendingOfflineOperations = useCallback(async () => {
    if (!isAuthenticated || !isOnline) {
      return;
    }

    const pendingOperations = await listPendingOfflineOperations(25).catch(
      () => [],
    );
    if (pendingOperations.length === 0) {
      return;
    }

    const syncableOperations = pendingOperations
      .filter((operation) => operation.entity === "todo")
      .map((operation) => {
        const payload =
          operation.payload && typeof operation.payload === "object"
            ? (operation.payload as Record<string, unknown>)
            : {};
        return {
          opId: operation.id,
          clientId: readOrCreateSyncClientId(),
          entityType: "todo" as const,
          entityId: operation.entityId,
          operation: operation.kind === "toggle" ? "toggle" : operation.kind,
          createdAt: operation.createdAt,
          payload,
        };
      })
      .filter(
        (operation): operation is {
          opId: string;
          clientId: string;
          entityType: "todo";
          entityId: string;
          operation: "create" | "update" | "delete" | "toggle";
          createdAt: number;
          payload: Record<string, unknown>;
        } =>
          operation.operation === "create" ||
          operation.operation === "update" ||
          operation.operation === "delete" ||
          operation.operation === "toggle",
      );

    if (syncableOperations.length === 0) {
      const attachmentResult = await flushPendingAttachmentOperations();
      const publicationResult = await flushPendingPublicationOperations();
      if (attachmentResult.uploaded > 0) {
        toast.message(
          `${attachmentResult.uploaded} attachment${attachmentResult.uploaded === 1 ? "" : "s"} uploaded`,
        );
      }
      if (attachmentResult.deleted > 0) {
        toast.message(
          `${attachmentResult.deleted} attachment${attachmentResult.deleted === 1 ? "" : "s"} deleted`,
        );
      }
      if (publicationResult.published > 0 || publicationResult.unpublished > 0) {
        toast.message("queued Bri publication changes synced");
      }
      return;
    }

    const result = await apiClient.syncPush({
      clientId: readOrCreateSyncClientId(),
      ops: syncableOperations,
    });
    const operationById = new Map(
      pendingOperations.map((operation) => [operation.id, operation]),
    );

    for (const acceptedOperation of result.accepted) {
      if (acceptedOperation.status === "accepted") {
        if (
          acceptedOperation.serverId &&
          acceptedOperation.entityId.startsWith("local-")
        ) {
          await migrateOfflineTodoReferences(
            acceptedOperation.entityId,
            acceptedOperation.serverId,
          ).catch(() => undefined);
        }
        await removeOfflineOperation(acceptedOperation.opId).catch(() => undefined);
      }
    }

    if (result.accepted.length > 0) {
      await refreshTodos();
      toast.message(
        `${result.accepted.length} offline todo${result.accepted.length === 1 ? "" : "s"} synced`,
      );
    }

    const recoverableIssues = [
      ...result.rejected.map((issue) => ({
        ...issue,
        serverId: null,
        serverVersion: null,
      })),
      ...result.conflicts.map((issue) => ({
        ...issue,
        serverVersion: issue.serverVersion ?? null,
      })),
    ];

    for (const issue of recoverableIssues) {
      const operation = operationById.get(issue.opId);
      if (!operation) {
        continue;
      }

      await upsertOfflineConflictRecovery({
        opId: operation.id,
        entity: operation.entity,
        entityId: operation.entityId,
        kind: operation.kind,
        payload: operation.payload,
        message: issue.message,
        serverId: issue.serverId,
        serverVersion: issue.serverVersion,
        createdAt: operation.createdAt,
      }).catch(() => undefined);
      await removeOfflineOperation(operation.id).catch(() => undefined);
    }

    if (recoverableIssues.length > 0) {
      toast.error("Some offline changes need review in settings.");
    }

    const attachmentResult = await flushPendingAttachmentOperations();
    const publicationResult = await flushPendingPublicationOperations();
    if (attachmentResult.uploaded > 0) {
      toast.message(
        `${attachmentResult.uploaded} attachment${attachmentResult.uploaded === 1 ? "" : "s"} uploaded`,
      );
    }
    if (attachmentResult.deleted > 0) {
      toast.message(
        `${attachmentResult.deleted} attachment${attachmentResult.deleted === 1 ? "" : "s"} deleted`,
      );
    }
    if (publicationResult.published > 0 || publicationResult.unpublished > 0) {
      toast.message("queued Bri publication changes synced");
    }
  }, [
    flushPendingAttachmentOperations,
    isAuthenticated,
    isOnline,
    refreshTodos,
  ]);

  useEffect(() => {
    void refreshTodos(true);
  }, [refreshTodos]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void (async () => {
      try {
        const cachedTodos = await getCachedTodos();
        if (cachedTodos.length === 0) {
          return;
        }

        setTodos(sortTodos(cachedTodos));
        setHasLoadedTodos(true);
      } catch {
        // Ignore local cache read failures to keep app usable.
      }
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !hasLoadedTodos) {
      return;
    }

    void setCachedTodos(todos).catch(() => undefined);
  }, [hasLoadedTodos, isAuthenticated, todos]);

  useEffect(() => {
    void refreshQueuedPromptCount();
  }, [refreshQueuedPromptCount]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) {
      return;
    }

    void flushQueuedPrompts();
    void flushPendingOfflineOperations();
  }, [
    flushPendingOfflineOperations,
    flushQueuedPrompts,
    isAuthenticated,
    isOnline,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTodos();
      void flushQueuedPrompts();
      void flushPendingOfflineOperations();
    }, 20_000);

    return () => window.clearInterval(timer);
  }, [
    flushPendingOfflineOperations,
    flushQueuedPrompts,
    isAuthenticated,
    refreshTodos,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !timeBlockNotificationsEnabled ||
      typeof window === "undefined" ||
      !("Notification" in window)
    ) {
      return;
    }

    if (Notification.permission === "default") {
      void Notification.requestPermission().then((permission) => {
        if (permission !== "granted") {
          try {
            window.localStorage.setItem(
              TIME_BLOCK_NOTIFICATIONS_STORAGE_KEY,
              "0",
            );
          } catch {
            // Ignore localStorage failures.
          }
          setTimeBlockNotificationsEnabled(false);
        }
      });
      return;
    }

    const canUseServiceWorkerNotifications =
      pushUpdatesEnabled && "serviceWorker" in navigator;

    const timestampTriggerCtor = (
      window as typeof window & {
        TimestampTrigger?: new (timestamp: number) => unknown;
      }
    ).TimestampTrigger;
    const canUseNotificationTriggers =
      canUseServiceWorkerNotifications && typeof timestampTriggerCtor === "function";

    const showTimeBlockNotification = async (
      todo: TodoItem,
      notificationTag: string,
      fireAt: number,
    ) => {
      const startLabel = new Date(todo.timeBlockStart ?? Date.now())
        .toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
        .toLowerCase();
      const body = `${todo.title} • ${displayEstimatedHours(
        todo.estimatedHours,
      )} starts at ${startLabel}.`;
      const todayDateKey = getLocalDateKey(Date.now());
      const targetView = isTodoOnDateKey(todo.dueDate, todayDateKey)
        ? "today"
        : "upcoming";
      const now = Date.now();

      if (canUseServiceWorkerNotifications) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            if (canUseNotificationTriggers && fireAt > now) {
              await registration.showNotification("Upcoming ibx block", {
                tag: notificationTag,
                body,
                data: {
                  url: `/?view=${targetView}`,
                },
                showTrigger: new timestampTriggerCtor(fireAt),
              } as NotificationOptions);
              return;
            }

            if (fireAt > now) {
              return;
            }

            await registration.showNotification(
              "Upcoming ibx block",
              {
                tag: notificationTag,
                body,
                data: {
                  url: `/?view=${targetView}`,
                },
              },
            );
            return;
          }
        } catch {
          // Fall through to direct notification API.
        }
      }

      if (fireAt > now) {
        return;
      }

      new Notification("Upcoming ibx block", {
        tag: notificationTag,
        body,
      });
    };

    const maybeNotifyUpcomingBlocks = async () => {
      if (Notification.permission !== "granted") {
        return;
      }

      const now = Date.now();
      for (const todo of todos) {
        if (todo.status !== "open" || typeof todo.timeBlockStart !== "number") {
          continue;
        }

        const fireAt = todo.timeBlockStart - NOTIFICATION_PRESTART_MS;
        const millisecondsUntilFire = fireAt - now;
        if (millisecondsUntilFire < -NOTIFICATION_LATE_GRACE_MS) {
          continue;
        }

        const notificationTag = `todo-block-prestart:${todo.id}:${todo.timeBlockStart}`;
        if (notifiedTimeBlocksRef.current.has(notificationTag)) {
          continue;
        }

        try {
          await showTimeBlockNotification(todo, notificationTag, fireAt);
          notifiedTimeBlocksRef.current.add(notificationTag);
        } catch {
          // Ignore notification delivery failures; UI should remain usable.
        }
      }
    };

    void maybeNotifyUpcomingBlocks();
    const timer = window.setInterval(() => {
      void maybeNotifyUpcomingBlocks();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [
    isAuthenticated,
    pushUpdatesEnabled,
    timeBlockNotificationsEnabled,
    todos,
  ]);

  const focusPromptInputAtEnd = useCallback(
    (force = false) => {
      if (!promptAutofocus || isGenerating || isProcessingQueue) {
        return;
      }

      const input = promptInputRef.current;
      if (!input) {
        return;
      }

      const activeElement = document.activeElement;
      if (
        !force &&
        activeElement &&
        activeElement !== document.body &&
        activeElement !== input
      ) {
        return;
      }

      input.focus({ preventScroll: true });
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    },
    [isGenerating, isProcessingQueue, promptAutofocus],
  );

  useEffect(() => {
    if (!hasHydratedPreferences || !promptAutofocus) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusPromptInputAtEnd(true);
      hasAppliedInitialAutofocus.current = true;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusPromptInputAtEnd, hasHydratedPreferences, promptAutofocus]);

  useEffect(() => {
    if (!hasHydratedPreferences || !promptAutofocus) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      focusPromptInputAtEnd(!hasAppliedInitialAutofocus.current);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    focusPromptInputAtEnd,
    hasHydratedPreferences,
    promptAutofocus,
    searchParams,
  ]);

  useEffect(() => {
    if (!hasHydratedPreferences) {
      return;
    }

    const viewParam = searchParams.get("view");
    if (!viewParam) {
      setFilter(readStoredFilter());
      return;
    }

    const normalizedView = normalizeFilter(viewParam);
    setFilter(normalizedView);

    if (normalizedView !== viewParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", normalizedView);
      router.replace(`/app?${params.toString()}`, { scroll: false });
    }
  }, [hasHydratedPreferences, router, searchParams]);

  useEffect(() => {
    if (!hasHydratedPreferences) {
      return;
    }

    if (!searchParams.get("view")) {
      const nextFilter = readStoredFilter();
      setFilter(nextFilter);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", nextFilter);
      router.replace(`/app?${params.toString()}`, { scroll: false });
    }
  }, [hasHydratedPreferences, router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const consumeShortcutPayload = async () => {
      const payload = readShortcutPayloadFromLocation(window.location);
      if (!payload || isShortcutConsumeRunning.current) {
        return;
      }

      const dedupeKey = payload.captureId
        ? `${SHORTCUT_CAPTURE_KEY_PREFIX}${payload.captureId}`
        : null;

      if (dedupeKey && window.sessionStorage.getItem(dedupeKey)) {
        clearShortcutPayloadFromLocation(window.location, filter);
        return;
      }

      isShortcutConsumeRunning.current = true;
      try {
        if (dedupeKey) {
          window.sessionStorage.setItem(dedupeKey, "1");
        }

        const queuedId = await queuePrompt(payload.text, payload.source);
        if (!queuedId) {
          clearShortcutPayloadFromLocation(window.location, filter);
          return;
        }

        if (isOnline && isAuthenticated) {
          toast.message("shortcut received. generating todos…");
          await flushQueuedPrompts();
        } else if (!isOnline) {
          toast.message(
            "shortcut received offline. queued for next connection.",
          );
        } else {
          toast.message("shortcut received. sign in to process queued items.");
        }

        clearShortcutPayloadFromLocation(window.location, filter);
      } finally {
        isShortcutConsumeRunning.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void consumeShortcutPayload();
      }
    };

    void consumeShortcutPayload();
    window.addEventListener("pageshow", consumeShortcutPayload);
    window.addEventListener("focus", consumeShortcutPayload);
    window.addEventListener("hashchange", consumeShortcutPayload);
    window.addEventListener("popstate", consumeShortcutPayload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", consumeShortcutPayload);
      window.removeEventListener("focus", consumeShortcutPayload);
      window.removeEventListener("hashchange", consumeShortcutPayload);
      window.removeEventListener("popstate", consumeShortcutPayload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [filter, flushQueuedPrompts, isAuthenticated, isOnline, queuePrompt]);

  const setActiveFilter = useCallback(
    (nextFilter: TodoFilter) => {
      setFilter(nextFilter);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", nextFilter);
      router.replace(`/app?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        focusPromptInputAtEnd(true);
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        if (event.code === "KeyZ") {
          event.preventDefault();
          setActiveFilter("zen");
          return;
        }

        if (event.code === "KeyJ") {
          event.preventDefault();
          setActiveFilter("today");
          return;
        }

        if (event.code === "KeyK") {
          event.preventDefault();
          setActiveFilter("upcoming");
          return;
        }

        if (event.code === "KeyL") {
          event.preventDefault();
          setActiveFilter("archive");
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusPromptInputAtEnd, setActiveFilter]);

  const handleGenerateTodos = async () => {
    const cleanInput = promptInput.trim();
    if (!cleanInput) {
      return;
    }

    setIsGenerating(true);
    try {
      const queuedId = await queuePrompt(cleanInput, "app");
      if (!queuedId) {
        return;
      }

      setPromptInput("");

      if (!isOnline) {
        toast.message("saved offline. ai will run when connection is back.");
        await refreshQueuedPromptCount();
        return;
      }

      await flushQueuedPrompts();
    } catch (error) {
      toastApiError(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const createTodoFromTitle = async (title: string) => {
    const cleanInput = title.trim();
    if (!cleanInput) {
      return false;
    }

    setIsAddingTodo(true);
    try {
      if (!isOnline) {
        const localTodo = createLocalManualTodo(cleanInput);
        setTodos((previousTodos) => sortTodos([...previousTodos, localTodo]));
        setHasLoadedTodos(true);
        await upsertOfflineTodoCreateOperation(localTodo);
        toast.message("todo saved offline");
        return true;
      }

      await apiClient.createManualTodo(cleanInput);
      toast.message("todo added");
      await refreshTodos();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        const localTodo = createLocalManualTodo(cleanInput);
        setTodos((previousTodos) => sortTodos([...previousTodos, localTodo]));
        setHasLoadedTodos(true);
        await upsertOfflineTodoCreateOperation(localTodo);
        toast.message("todo saved offline");
        return true;
      }

      toastApiError(error);
      return false;
    } finally {
      setIsAddingTodo(false);
    }
  };

  const handleAddTodo = async () => {
    const saved = await createTodoFromTitle(promptInput);
    if (saved) {
      setPromptInput("");
    }
  };

  const saveTodoPatch = async (
    todo: TodoItem,
    patch: TodoPatch,
    options: {
      apiPatch?: TodoApiPatch;
      offlineMessage?: string;
      successMessage?: string;
      onNetworkSaved?: () => void;
      onQueued?: () => void;
      onFailure?: () => void;
    } = {},
  ) => {
    const nextTodo: TodoItem = { ...todo, ...patch };
    const queueOfflinePatch = async () => {
      if (todo.id.startsWith("local-")) {
        await upsertOfflineTodoCreateOperation(nextTodo);
        return;
      }

      await enqueueOfflineOperation({
        entity: "todo",
        entityId: todo.id,
        kind: "update",
        payload: patch,
      });
    };

    const { dueDate: localDueDate, ...apiPatchBase } = patch;
    const apiPatch: TodoApiPatch =
      options.apiPatch ??
      {
        ...apiPatchBase,
        ...(localDueDate !== undefined
          ? {
              dueDate:
                typeof localDueDate === "number"
                  ? getLocalDateKey(localDueDate)
                  : localDueDate,
            }
          : {}),
      };

    setPendingTodoId(todo.id);
    setTodos((previousTodos) =>
      sortTodos(
        previousTodos.map((item) => (item.id === todo.id ? nextTodo : item)),
      ),
    );
    setHasLoadedTodos(true);

    try {
      if (!isOnline || todo.id.startsWith("local-")) {
        await queueOfflinePatch();
        options.onQueued?.();
        if (options.offlineMessage) {
          toast.message(options.offlineMessage);
        }
        return true;
      }

      await apiClient.updateTodo(todo.id, apiPatch);
      options.onNetworkSaved?.();
      if (options.successMessage) {
        toast.message(options.successMessage);
      }
      await refreshTodos();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await queueOfflinePatch();
        options.onQueued?.();
        if (options.offlineMessage) {
          toast.message(options.offlineMessage);
        }
        return true;
      }

      setTodos((previousTodos) =>
        sortTodos(
          previousTodos.map((item) => (item.id === todo.id ? todo : item)),
        ),
      );
      options.onFailure?.();
      toastApiError(error);
      return false;
    } finally {
      setPendingTodoId(null);
    }
  };

  const updateTodoStatus = async (todo: TodoItem, checked: boolean) => {
    const nextStatus = checked ? "done" : "open";
    if (checked) {
      setJustCompletedZenTodoId(todo.id);
    }

    const saved = await saveTodoPatch(
      todo,
      { status: nextStatus },
      { offlineMessage: "todo updated offline" },
    );
    if (!saved) {
      if (checked) {
        setJustCompletedZenTodoId(null);
      }
    }
  };

  const updateTodoDate = async (todo: TodoItem, nextDate: string) => {
    const normalizedDate = nextDate.trim();
    const dueDate = normalizedDate ? normalizedDate : null;
    const nextTimeBlockStart =
      normalizedDate && typeof todo.timeBlockStart === "number"
        ? Date.parse(
            `${normalizedDate}T${
              displayTimeBlockClockValue(todo.timeBlockStart).trim() || "18:00"
            }`,
          )
        : undefined;
    const normalizedTimeBlockStart =
      typeof nextTimeBlockStart === "number" &&
      Number.isFinite(nextTimeBlockStart) &&
      nextTimeBlockStart > 0
        ? nextTimeBlockStart
        : undefined;

    await saveTodoPatch(
      todo,
      {
        dueDate: normalizedDate ? dateKeyToTimestamp(normalizedDate) : null,
        ...(normalizedDate && normalizedTimeBlockStart !== undefined
          ? { timeBlockStart: normalizedTimeBlockStart }
          : {}),
      },
      {
        apiPatch: {
          dueDate,
          ...(normalizedDate && normalizedTimeBlockStart !== undefined
            ? { timeBlockStart: normalizedTimeBlockStart }
            : {}),
        },
        offlineMessage: "todo date updated offline",
      },
    );
  };

  const updateTodoEstimatedHours = async (
    todo: TodoItem,
    nextEstimatedHours: string,
  ) => {
    const normalizedEstimatedHours =
      parseEstimatedHoursInput(nextEstimatedHours);

    if (normalizedEstimatedHours === undefined) {
      toast.error(
        "duration must be between 15 minutes and 24 hours (for example: 15m, 1h, 1h 30m).",
      );
      return;
    }

    if (
      normalizeEstimatedHours(todo.estimatedHours) === normalizedEstimatedHours
    ) {
      return;
    }

    await saveTodoPatch(
      todo,
      {
        estimatedHours: normalizedEstimatedHours,
      },
      { offlineMessage: "todo duration updated offline" },
    );
  };

  const updateTodoTimeBlockStart = async (
    todo: TodoItem,
    nextTimeBlockInput: string,
  ) => {
    const trimmed = nextTimeBlockInput.trim();
    const normalizedTimeBlockStart = (() => {
      if (trimmed.length === 0) {
        return null;
      }

      if (/^\d{2}:\d{2}$/.test(trimmed)) {
        const [hoursText, minutesText] = trimmed.split(":");
        const hours = Number(hoursText);
        const minutes = Number(minutesText);
        if (
          !Number.isInteger(hours) ||
          !Number.isInteger(minutes) ||
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59
        ) {
          return undefined;
        }

        const dateKey =
          getTodoDateKey(todo.dueDate) ??
          (typeof todo.timeBlockStart === "number"
            ? getLocalDateKey(todo.timeBlockStart)
            : getLocalDateKey(Date.now()));
        const parsed = Date.parse(`${dateKey}T${trimmed}`);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return undefined;
        }

        return parsed;
      }

      const parsed = Date.parse(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return undefined;
      }
      return parsed;
    })();

    if (normalizedTimeBlockStart === undefined) {
      toast.error("time block start must be a valid local date and time.");
      return;
    }

    if ((todo.timeBlockStart ?? null) === normalizedTimeBlockStart) {
      return;
    }

    await saveTodoPatch(
      todo,
      {
        timeBlockStart: normalizedTimeBlockStart,
      },
      { offlineMessage: "todo schedule updated offline" },
    );
  };

  const updateTodoRecurrence = async (todo: TodoItem, values: string[]) => {
    const nextRecurrence = values[0];
    if (
      nextRecurrence !== "none" &&
      nextRecurrence !== "daily" &&
      nextRecurrence !== "weekly" &&
      nextRecurrence !== "monthly"
    ) {
      return;
    }

    await saveTodoPatch(
      todo,
      {
        recurrence: nextRecurrence as TodoRecurrence,
      },
      { offlineMessage: "todo recurrence updated offline" },
    );
  };

  const updateTodoPriority = async (todo: TodoItem, values: string[]) => {
    const nextPriority = values[0];
    if (nextPriority !== "1" && nextPriority !== "2" && nextPriority !== "3") {
      return;
    }

    await saveTodoPatch(
      todo,
      {
        priority: Number(nextPriority) as TodoPriority,
      },
      { offlineMessage: "todo priority updated offline" },
    );
  };

  const updateTodoTitle = async (todo: TodoItem) => {
    const nextTitle = editingTitleInput.trim().slice(0, 140);

    if (!nextTitle) {
      toast.error("todo title is required");
      setEditingTitleInput(todo.title);
      return;
    }

    if (nextTitle === todo.title) {
      return;
    }

    const previousTitle = todo.title;
    await saveTodoPatch(
      todo,
      { title: nextTitle },
      {
        offlineMessage: "todo title updated offline",
        onFailure: () => setEditingTitleInput(previousTitle),
      },
    );
  };

  const updateTodoLinks = async (todo: TodoItem) => {
    const parsed = parseTodoLinksInput(editingLinksInput);
    const currentLinks = getTodoResourceLinks(todo.notes).map(
      (link) => link.url,
    );
    const nextLinksText = parsed.links.join(", ");

    if (areStringListsEqual(parsed.links, currentLinks)) {
      if (editingLinksInput.trim() !== nextLinksText) {
        setEditingLinksInput(nextLinksText);
      }
      return;
    }

    const description = stripTodoLinksFromNotes(todo.notes);
    const nextNotes = buildTodoNotesWithLinks(description, parsed.links);
    const previousNotes = todo.notes;

    if ((nextNotes ?? null) === (previousNotes ?? null)) {
      if (editingLinksInput.trim() !== nextLinksText) {
        setEditingLinksInput(nextLinksText);
      }
      return;
    }

    setEditingLinksInput(nextLinksText);
    const saved = await saveTodoPatch(
      todo,
      {
        notes: nextNotes,
        notesJson: null,
        notesHtml: null,
      },
      {
        offlineMessage: "todo links updated offline",
        onFailure: () => setEditingLinksInput(getTodoLinksInputValue(previousNotes)),
      },
    );

    if (saved && parsed.invalidCount > 0) {
      toast.message("some invalid links were ignored");
    }
  };

  const confirmDeleteTodo = async () => {
    if (!todoPendingDelete) {
      return;
    }

    const targetTodo = todoPendingDelete;
    const previousTodos = todos;
    const clearDeleteUi = () => {
      setEditingTodoId((current) => {
        if (current === targetTodo.id) {
          setEditingTitleInput("");
          setEditingLinksInput("");
          return null;
        }

        return current;
      });
      setTodoPendingDelete(null);
    };
    const deleteLocally = async () => {
      setTodos((current) => current.filter((todo) => todo.id !== targetTodo.id));
      setHasLoadedTodos(true);
      clearDeleteUi();
      if (targetTodo.id.startsWith("local-")) {
        await removeOfflineOperationsByEntity("todo", targetTodo.id).catch(
          () => undefined,
        );
      } else {
        await enqueueOfflineOperation({
          entity: "todo",
          entityId: targetTodo.id,
          kind: "delete",
          payload: {},
        });
      }
    };

    setPendingTodoId(targetTodo.id);
    try {
      if (!isOnline) {
        await deleteLocally();
        toast.message("todo deleted offline");
        return;
      }

      await apiClient.deleteTodo(targetTodo.id);
      clearDeleteUi();
      toast.message("todo deleted");
      await refreshTodos();
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await deleteLocally();
        toast.message("todo deleted offline");
        return;
      }

      setTodos(previousTodos);
      toastApiError(error);
    } finally {
      setPendingTodoId(null);
    }
  };

  const cleanupArchivedTodos = async () => {
    const archivedTodos = todos.filter((todo) => todo.status === "done");
    if (archivedTodos.length === 0) {
      setIsArchiveCleanupOpen(false);
      return;
    }

    const previousTodos = todos;
    setTodos((current) => current.filter((todo) => todo.status !== "done"));
    setIsArchiveCleanupOpen(false);

    try {
      const cleanupResults = await Promise.allSettled(
        archivedTodos.map(async (todo) => {
          if (!isOnline || todo.id.startsWith("local-")) {
            await enqueueOfflineOperation({
              entity: "todo",
              entityId: todo.id,
              kind: "delete",
              payload: {},
            });
          } else {
            await apiClient.deleteTodo(todo.id);
          }
        }),
      );
      const failedCleanup = cleanupResults.find(
        (result) => result.status === "rejected",
      );
      if (failedCleanup?.status === "rejected") {
        throw failedCleanup.reason;
      }
      toast.message(
        archivedTodos.length === 1
          ? "archive cleaned"
          : `${archivedTodos.length} archived todos cleaned`,
      );
      if (isOnline) {
        await refreshTodos();
      }
    } catch (error) {
      setTodos(previousTodos);
      toastApiError(error);
    }
  };

  const moveTodoToSection = async (todoId: string, sectionKey: string) => {
    const targetTodo = todos.find((todo) => todo.id === todoId);
    if (!targetTodo) {
      return;
    }

    if (sectionKey.startsWith("today-p")) {
      const priority = Number(sectionKey.replace("today-p", ""));
      if (priority === 1 || priority === 2 || priority === 3) {
        await saveTodoPatch(
          targetTodo,
          {
            priority: priority as TodoPriority,
            dueDate: dateKeyToTimestamp(getLocalDateKey(Date.now())),
          },
          {
            apiPatch: {
              priority: priority as TodoPriority,
              dueDate: getLocalDateKey(Date.now()),
            },
            offlineMessage: "todo moved offline",
          },
        );
      }
      return;
    }

    if (ISO_DATE_REGEX.test(sectionKey)) {
      await updateTodoDate(targetTodo, sectionKey);
    }
  };

  const groupedTodos = useMemo(() => {
    const todayDateKey = getLocalDateKey(Date.now());
    const openTodos = todos.filter((todo) => todo.status === "open");
    const dueToday = openTodos.filter((todo) =>
      isTodoOnDateKey(todo.dueDate, todayDateKey),
    );
    const todayIds = new Set(dueToday.map((todo) => todo.id));

    return {
      today: [...dueToday].sort(compareByPriorityAndStartTime),
      upcoming: [...openTodos]
        .filter((todo) => !todayIds.has(todo.id))
        .sort(compareByPriorityAndStartTime),
      archive: [...todos]
        .filter((todo) => todo.status === "done")
        .sort(compareByPriorityAndStartTime),
    };
  }, [todos]);

  const zenNowTodo = useMemo(() => {
    const openTodos = todos.filter(
      (todo) => todo.status === "open" && todo.id !== justCompletedZenTodoId,
    );
    if (openTodos.length === 0) {
      return null;
    }

    return [...openTodos].sort(compareByPriorityAndStartTime)[0] ?? null;
  }, [justCompletedZenTodoId, todos]);

  useEffect(() => {
    if (!justCompletedZenTodoId) {
      return;
    }

    const stillOpen = todos.some(
      (todo) => todo.id === justCompletedZenTodoId && todo.status === "open",
    );
    if (!stillOpen) {
      setJustCompletedZenTodoId(null);
    }
  }, [justCompletedZenTodoId, todos]);

  const filteredTodos = useMemo(() => {
    if (filter === "zen") {
      return zenNowTodo ? [zenNowTodo] : [];
    }

    if (filter === "today") {
      return groupedTodos.today;
    }

    if (filter === "upcoming") {
      return groupedTodos.upcoming;
    }

    if (filter === "archive") {
      return groupedTodos.archive;
    }

    return groupedTodos.today;
  }, [filter, groupedTodos, zenNowTodo]);

  const visibleTodos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return filteredTodos;
    }

    return filteredTodos.filter((todo) => {
      const haystack = [
        todo.title,
        todo.notes ?? "",
        displayPriority(todo.priority),
        displayRecurrence(todo.recurrence),
        displayDueDate(todo.dueDate),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [filteredTodos, searchQuery]);

  const todoSections = useMemo<TodoSection[]>(() => {
    if (filter === "zen") {
      return [];
    }

    if (filter === "today") {
      const byPriority: Record<TodoPriority, TodoItem[]> = {
        1: [],
        2: [],
        3: [],
      };
      for (const todo of visibleTodos) {
        byPriority[normalizeTodoPriority(todo.priority)].push(todo);
      }

      return ([1, 2, 3] as TodoPriority[])
        .map((priority) => {
          const sectionTodos = byPriority[priority].sort(compareByPriorityAndStartTime);
          return {
            key: `today-p${priority}`,
            label: `${TODAY_PRIORITY_LABELS[priority]} // ${formatSectionHoursLabel(
              sectionTodos,
            )}`,
            todos: sectionTodos,
          };
        });
    }

    const sectionsByDate = new Map<
      string,
      { dateKey: string | null; todos: TodoItem[] }
    >();

    for (const todo of visibleTodos) {
      const dateKey = getTodoDateKey(todo.dueDate);
      const mapKey = dateKey === null ? "no-date" : String(dateKey);
      const existingSection = sectionsByDate.get(mapKey);
      if (existingSection) {
        existingSection.todos.push(todo);
      } else {
        sectionsByDate.set(mapKey, { dateKey, todos: [todo] });
      }
    }

    return [...sectionsByDate.entries()]
      .sort((left, right) => {
        const leftDate = left[1].dateKey;
        const rightDate = right[1].dateKey;

        if (leftDate === null && rightDate === null) {
          return 0;
        }
        if (leftDate === null) {
          return 1;
        }
        if (rightDate === null) {
          return -1;
        }

        if (leftDate === rightDate) {
          return 0;
        }

        return filter === "upcoming"
          ? leftDate.localeCompare(rightDate)
          : rightDate.localeCompare(leftDate);
      })
      .map(([key, section]) => ({
        key,
        label: `${formatSectionDateLabel(section.dateKey, filter, Date.now())} // ${formatSectionHoursLabel(section.todos)}`,
        todos: section.todos.sort(compareByPriorityAndStartTime),
      }));
  }, [filter, visibleTodos]);

  const todoDisplayMetaById = useMemo(() => {
    const map = new Map<string, TodoDisplayMeta>();
    for (const todo of visibleTodos) {
      map.set(todo.id, getTodoDisplayMeta(todo.notes));
    }
    return map;
  }, [visibleTodos]);

  const runTerminalCommand = async () => {
    const input = terminalInput.trim();
    if (!input) {
      return;
    }

    const [rawCommand = "", ...rest] = input.split(/\s+/);
    const command = rawCommand.toLowerCase();
    const argument = rest.join(" ").trim();
    const addOutput = (line: string) =>
      setTerminalOutput((current) => [...current.slice(-40), `$ ${input}`, line]);
    const todoAtIndex = (value: string) => {
      const index = Number(value) - 1;
      return Number.isInteger(index) && index >= 0 ? visibleTodos[index] : null;
    };
    const todoByIndexOrId = (value: string) =>
      todoAtIndex(value) ?? todos.find((todo) => todo.id === value) ?? null;
    const formatTodoLine = (todo: TodoItem, index: number) =>
      `${index + 1}\t${displayPriority(todo.priority)}\t${displayDueDate(
        todo.dueDate,
      )}\t${todo.status}\t${todo.title}`;

    setTerminalInput("");

    if (command === "help") {
      addOutput(
        [
          "commands:",
          "  help",
          "  clear",
          "  pwd",
          "  ls [all|today|upcoming|archive]",
          "  search <text>",
          "  create <title>",
          "  open <number|id>",
          "  done <number|id>",
          "  delete <number|id>",
          "  cd today|upcoming|archive|zen",
        ].join("\n"),
      );
      return;
    }

    if (command === "clear") {
      setTerminalOutput([]);
      return;
    }

    if (command === "pwd") {
      addOutput(`/ibx/${filter}`);
      return;
    }

    if (command === "cd") {
      if (
        argument === "today" ||
        argument === "upcoming" ||
        argument === "archive" ||
        argument === "zen"
      ) {
        setActiveFilter(argument);
        addOutput(`/ibx/${argument}`);
        return;
      }
      addOutput("usage: cd today|upcoming|archive|zen");
      return;
    }

    if (command === "ls" || command === "list") {
      const scope =
        argument === "all"
          ? todos
          : argument === "archive"
            ? groupedTodos.archive
            : argument === "upcoming"
              ? groupedTodos.upcoming
              : argument === "today"
                ? groupedTodos.today
                : visibleTodos;
      addOutput(
        scope.slice(0, 24).map(formatTodoLine).join("\n") || "no todos",
      );
      return;
    }

    if (command === "search") {
      setSearchQuery(argument);
      addOutput(`searching "${argument}"`);
      return;
    }

    if (command === "create" || command === "add") {
      const saved = await createTodoFromTitle(argument);
      addOutput(saved ? `created "${argument}"` : "create failed");
      return;
    }

    if (command === "open") {
      const todo = todoByIndexOrId(argument);
      if (todo) {
        router.push(getTodoPageHref(todo));
      }
      addOutput(todo ? `opening ${todo.title}` : "todo not found");
      return;
    }

    if (command === "done" || command === "complete") {
      const todo = todoByIndexOrId(argument);
      if (todo) {
        await updateTodoStatus(todo, true);
      }
      addOutput(todo ? `completed ${todo.title}` : "todo not found");
      return;
    }

    if (command === "delete" || command === "rm") {
      const todo = todoByIndexOrId(argument);
      if (todo) {
        setTodoPendingDelete(todo);
      }
      addOutput(todo ? `delete review opened for ${todo.title}` : "todo not found");
      return;
    }

    addOutput("unknown command. type help.");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandCenterOpen(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "`") {
        event.preventDefault();
        toggleTerminal();
        return;
      }

      if (!isTypingTarget && event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTerminal]);

  const showTaskDetails = true;
  const showZenView = filter === "zen";
  const terminalLines = terminalOutput.flatMap((entry) => entry.split("\n"));
  const renderTerminalLine = (line: string, index: number) => {
    if (line.startsWith("$ ")) {
      const [, command = "", args = ""] = line.match(/^\$ (\S+)(?:\s+(.*))?$/) ?? [];
      return (
        <div key={`${line}-${index}`} className="flex gap-2">
          <span className="text-neutral-600">$</span>
          <span className="text-neutral-100">{command}</span>
          {args ? <span className="text-neutral-400">{args}</span> : null}
        </div>
      );
    }

    const columns = line.split("\t");
    if (columns.length >= 5 && /^\d+$/.test(columns[0] ?? "")) {
      return (
        <div
          key={`${line}-${index}`}
          className="grid grid-cols-[2rem_3rem_7rem_4rem_minmax(0,1fr)] gap-2 text-neutral-400"
        >
          <span className="text-neutral-600">{columns[0]}</span>
          <span className="text-neutral-300">{columns[1]}</span>
          <span>{columns[2]}</span>
          <span className="text-neutral-500">{columns[3]}</span>
          <span className="truncate text-neutral-200">{columns.slice(4).join(" ")}</span>
        </div>
      );
    }

    if (line.endsWith(":")) {
      return (
        <div key={`${line}-${index}`} className="text-neutral-300">
          {line}
        </div>
      );
    }

    if (/^\s{2}\S/.test(line)) {
      return (
        <div key={`${line}-${index}`} className="pl-4 text-neutral-500">
          {line.trim()}
        </div>
      );
    }

    return (
      <div key={`${line}-${index}`} className="text-neutral-400">
        {line || " "}
      </div>
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-12 border-b p-0">
            <div className="flex h-12 items-center justify-between px-3 group-data-[collapsible=icon]:hidden">
              <p className="text-sm">ibx</p>
              <SidebarTrigger size="icon-sm" variant="ghost" />
            </div>
            <div className="hidden h-12 items-center justify-center group-data-[collapsible=icon]:flex">
              <SidebarTrigger size="icon-sm" variant="ghost" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>focus</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={filter === "zen"}
                      onClick={() => setActiveFilter("zen")}
                      className="group-data-[collapsible=icon]:justify-center"
                      title="alt+z"
                    >
                      <span className="group-data-[collapsible=icon]:hidden">
                        zen
                      </span>
                      <span className="hidden group-data-[collapsible=icon]:inline">
                        {">"}
                      </span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{zenNowTodo ? 1 : 0}</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={filter === "today"}
                      onClick={() => setActiveFilter("today")}
                      className="group-data-[collapsible=icon]:justify-center"
                    >
                      <span className="group-data-[collapsible=icon]:hidden">
                        today
                      </span>
                      <span className="hidden group-data-[collapsible=icon]:inline">
                        {"\\"}
                      </span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      {groupedTodos.today.length}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={filter === "upcoming"}
                      onClick={() => setActiveFilter("upcoming")}
                      className="group-data-[collapsible=icon]:justify-center"
                    >
                      <span className="group-data-[collapsible=icon]:hidden">
                        upcoming
                      </span>
                      <span className="hidden group-data-[collapsible=icon]:inline">
                        /
                      </span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      {groupedTodos.upcoming.length}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={filter === "archive"}
                      onClick={() => setActiveFilter("archive")}
                      className="group-data-[collapsible=icon]:justify-center"
                    >
                      <span className="group-data-[collapsible=icon]:hidden">
                        archive
                      </span>
                      <span className="hidden group-data-[collapsible=icon]:inline">
                        [
                      </span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      {groupedTodos.archive.length}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/settings" prefetch={false} />}
                      className="group-data-[collapsible=icon]:justify-center"
                    >
                      <span className="group-data-[collapsible=icon]:hidden">
                        settings
                      </span>
                      <span className="hidden group-data-[collapsible=icon]:inline">
                        ]
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t">
            <SidebarAccount />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-h-dvh flex flex-col">
          <header className="sticky top-0 z-20 flex h-12 items-center border-b bg-background px-4 md:px-6">
            <div className="flex w-full items-center gap-2">
              <SidebarTrigger
                className="md:hidden"
                size="icon-sm"
                variant="ghost"
              />
              <span className="text-muted-foreground">{">"}</span>
              <Input
                ref={promptInputRef}
                value={promptInput}
                onChange={(event) => setPromptInput(event.target.value)}
                placeholder="type once, ibx can create, update, schedule"
                autoFocus={promptAutofocus}
                className="h-8 border-0 bg-transparent lowercase text-[0.8rem]! px-0 shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleGenerateTodos();
                  }
                }}
                disabled={isGenerating || isAddingTodo || isProcessingQueue}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleAddTodo()}
                disabled={isGenerating || isAddingTodo || isProcessingQueue}
              >
                {isAddingTodo ? "adding..." : "add"}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleGenerateTodos()}
                disabled={isGenerating || isAddingTodo || isProcessingQueue}
                title={
                  queuedPromptCount > 0
                    ? `${queuedPromptCount} queued`
                    : undefined
                }
              >
                {isGenerating || isProcessingQueue ? "running..." : "run"}
              </Button>
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="search"
                className="hidden h-8 w-40 border-0 bg-transparent px-1 text-[0.8rem] shadow-none focus-visible:ring-0 sm:block"
                aria-label="Search todos"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsCommandCenterOpen(true)}
              >
                cmd
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={toggleTerminal}
              >
                term
              </Button>
            </div>
          </header>

          <main
            className={cn(
              "min-h-0 flex-1 overflow-y-auto",
              showZenView ? "grid place-items-center px-4 md:px-6" : "py-4",
            )}
          >
            {!hasLoadedTodos && isLoadingTodos ? (
              <p className="px-4 text-sm text-muted-foreground md:px-6">
                loading todos…
              </p>
            ) : showZenView ? (
              zenNowTodo ? (
                <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
                  <p className="text-xs text-muted-foreground">
                    zen //{" "}
                    {formatEstimatedHoursInput(zenNowTodo.estimatedHours) ||
                      "unsized"}
                  </p>
                  <p className="mt-4 text-2xl leading-tight tracking-tight lowercase md:text-3xl">
                    {zenNowTodo.title}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void updateTodoStatus(zenNowTodo, true)}
                      disabled={pendingTodoId === zenNowTodo.id}
                    >
                      done
                    </Button>
                  </div>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">
                  no todo ready for now.
                </p>
              )
            ) : visibleTodos.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground md:px-6">
                {searchQuery.trim()
                  ? "no todos match that search."
                  : "no todos in this view yet."}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {filter === "archive" && groupedTodos.archive.length > 0 ? (
                  <div className="px-4 md:px-6">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIsArchiveCleanupOpen(true)}
                    >
                      clean archive
                    </Button>
                  </div>
                ) : null}
                {todoSections.map((section, sectionIndex) => (
                  <section
                    key={section.key}
                    className={cn(
                      "flex flex-col gap-0",
                      section.label ? "pt-2" : "",
                    )}
                    onDragOver={(event) => {
                      if (draggedTodoId) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedTodoId) {
                        void moveTodoToSection(draggedTodoId, section.key);
                        setDraggedTodoId(null);
                      }
                    }}
                  >
                    {section.label ? (
                      <p className="px-4 pb-2 text-xs text-muted-foreground md:px-6">
                        {section.label}
                      </p>
                    ) : null}
                    {section.todos.map((todo, index) => {
                      const todoMeta =
                        todoDisplayMetaById.get(todo.id) ??
                        getTodoDisplayMeta(todo.notes);
                      const resourceLinks = todoMeta.links;
                      const notesDescription = todoMeta.description;
                      const previewNotesDescription = todoMeta.descriptionPreview;
                      const isZenLeadTask =
                        zenModeEnabled &&
                        sectionIndex === 0 &&
                        index === 0 &&
                        todo.status === "open";

                      return (
                        <article
                          key={todo.id}
                          data-todo-article-id={todo.id}
                          draggable={
                            filter !== "archive" &&
                            pendingTodoId !== todo.id &&
                            holdingTodoId !== todo.id
                          }
                          className={cn(
                            "group relative cursor-pointer overflow-hidden border-b select-none [content-visibility:auto] [contain-intrinsic-size:0_56px]",
                            index === 0 && "border-t",
                            zenModeEnabled &&
                              "transition-colors [contain-intrinsic-size:0_64px]",
                            isZenLeadTask &&
                              "bg-neutral-50/40 dark:bg-neutral-950/50",
                            todo.status === "done" &&
                              "bg-neutral-100 dark:bg-neutral-900/90 dark:border-neutral-800",
                          )}
                          onClick={(event) => {
                            if (suppressNextClickRef.current) {
                              suppressNextClickRef.current = false;
                              return;
                            }

                            if (isInteractiveTarget(event.target)) {
                              return;
                            }

                            setEditingTodoId((current) =>
                              current === todo.id ? null : todo.id,
                            );
                            setEditingTitleInput(todo.title);
                            setEditingLinksInput(todoMeta.linksInputValue);
                          }}
                          onDragStart={(event) => {
                            if (
                              filter === "archive" ||
                              holdingTodoId === todo.id ||
                              heldTodoIdRef.current === todo.id
                            ) {
                              event.preventDefault();
                              return;
                            }
                            setDraggedTodoId(todo.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", todo.id);
                          }}
                          onDragEnd={() => setDraggedTodoId(null)}
                          onPointerDown={(event) => {
                            if (
                              pendingTodoId === todo.id ||
                              isInteractiveTarget(event.target) ||
                              draggedTodoId === todo.id
                            ) {
                              return;
                            }

                            cancelHoldInteraction();
                            heldTodoIdRef.current = todo.id;
                            holdStartRef.current = {
                              x: event.clientX,
                              y: event.clientY,
                            };
                            event.currentTarget.setPointerCapture?.(
                              event.pointerId,
                            );
                            setHoldingTodoId(todo.id);
                            holdStartedAtRef.current = performance.now();
                            const animateHoldProgress = () => {
                              if (
                                holdStartedAtRef.current === null ||
                                heldTodoIdRef.current !== todo.id
                              ) {
                                return;
                              }

                              const elapsed =
                                performance.now() - holdStartedAtRef.current;
                              const progress =
                                elapsed <= HOLD_PROGRESS_DELAY_MS
                                  ? 0
                                  : Math.min(
                                      1,
                                      (elapsed - HOLD_PROGRESS_DELAY_MS) /
                                        HOLD_PROGRESS_SWEEP_MS,
                                    );
                              setHoldProgress(progress);

                              if (progress < 1) {
                                holdAnimationFrameRef.current =
                                  window.requestAnimationFrame(
                                    animateHoldProgress,
                                  );
                              }
                            };
                            holdAnimationFrameRef.current =
                              window.requestAnimationFrame(animateHoldProgress);
                            holdTimerRef.current = window.setTimeout(() => {
                              suppressNextClickRef.current = true;
                              void updateTodoStatus(
                                todo,
                                todo.status !== "done",
                              );
                              clearHoldAnimation();
                              holdStartRef.current = null;
                              heldTodoIdRef.current = null;
                            }, HOLD_TO_TOGGLE_MS);
                          }}
                          onPointerMove={(event) => {
                            if (
                              heldTodoIdRef.current !== todo.id ||
                              !holdStartRef.current
                            ) {
                              return;
                            }

                            const movedX = Math.abs(
                              event.clientX - holdStartRef.current.x,
                            );
                            const movedY = Math.abs(
                              event.clientY - holdStartRef.current.y,
                            );
                            if (
                              movedX > HOLD_MOVE_CANCEL_PX ||
                              movedY > HOLD_MOVE_CANCEL_PX
                            ) {
                              cancelHoldInteraction();
                            }
                          }}
                          onPointerUp={(event) => {
                            event.currentTarget.releasePointerCapture?.(
                              event.pointerId,
                            );
                            cancelHoldInteraction();
                          }}
                          onPointerCancel={(event) => {
                            event.currentTarget.releasePointerCapture?.(
                              event.pointerId,
                            );
                            cancelHoldInteraction();
                          }}
                        >
                          <div
                            className="pointer-events-none absolute inset-y-0 left-0 z-0 overflow-hidden"
                            style={{
                              width: `${holdProgress * 100}%`,
                              opacity: holdingTodoId === todo.id ? 1 : 0,
                            }}
                          >
                            <div className="h-full w-full bg-black/18 dark:bg-white/16" />
                            <div className="absolute inset-y-0 right-0 w-px bg-foreground/45 dark:bg-foreground/60" />
                          </div>
                          <div
                            className={cn(
                              "relative z-10 flex flex-col gap-1.5 px-4 py-3 md:px-6",
                              zenModeEnabled && "py-4",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="relative flex items-start justify-between gap-2">
                                  {editingTodoId === todo.id ? (
                                    <Input
                                      value={editingTitleInput}
                                      onChange={(event) =>
                                        setEditingTitleInput(event.target.value)
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          void updateTodoTitle(todo);
                                          event.currentTarget.blur();
                                        }

                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          setEditingTitleInput(todo.title);
                                          event.currentTarget.blur();
                                        }
                                      }}
                                      onBlur={() => {
                                        void updateTodoTitle(todo);
                                      }}
                                      className={cn(
                                        "h-auto w-full border-0 bg-transparent px-0 py-0 text-sm leading-5 lowercase shadow-none ring-0 focus-visible:ring-0",
                                        zenModeEnabled &&
                                          "text-[15px] leading-6 md:text-base",
                                        isZenLeadTask &&
                                          "text-foreground/95",
                                        todo.status === "done" &&
                                          "line-through opacity-70",
                                      )}
                                      disabled={pendingTodoId === todo.id}
                                      maxLength={140}
                                      aria-label="Edit todo title"
                                    />
                                  ) : (
                                    <p
                                      className={cn(
                                        "truncate text-sm leading-5 lowercase sm:pr-16",
                                        zenModeEnabled &&
                                          "text-[15px] leading-6 md:text-base",
                                        isZenLeadTask &&
                                          "text-foreground/95",
                                        todo.status === "done" &&
                                          "line-through opacity-70",
                                      )}
                                    >
                                      {todo.title}
                                    </p>
                                  )}
                                  {editingTodoId !== todo.id ? (
                                    <span
                                      className="shrink-0 opacity-100 sm:absolute sm:right-0 sm:top-0 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
                                      style={{ transition: "opacity 180ms ease" }}
                                    >
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 border-border/70 bg-background/80 px-3 text-xs font-medium shadow-sm hover:border-foreground/30 hover:bg-muted hover:text-foreground"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          router.push(getTodoPageHref(todo));
                                        }}
                                        onPointerDown={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        edit
                                      </Button>
                                    </span>
                                  ) : null}
                                </div>
                                {showTaskDetails &&
                                !zenModeEnabled &&
                                notesDescription ? (
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <p className="max-w-full break-words lowercase">
                                      {expandedNoteIds[todo.id]
                                        ? notesDescription
                                        : previewNotesDescription}
                                    </p>
                                    {notesDescription.length > NOTE_PREVIEW_LENGTH ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 px-1 text-[11px] text-muted-foreground hover:text-foreground"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setExpandedNoteIds((current) => ({
                                            ...current,
                                            [todo.id]: !current[todo.id],
                                          }));
                                        }}
                                        onPointerDown={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        {expandedNoteIds[todo.id]
                                          ? "less"
                                          : "more"}
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                                {showTaskDetails &&
                                !zenModeEnabled &&
                                resourceLinks.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                    <span>links:</span>
                                    {resourceLinks.map((link, index) => (
                                      <span key={link.url} className="lowercase">
                                        <a
                                          href={link.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="underline-offset-2 hover:underline hover:text-foreground"
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          onPointerDown={(event) =>
                                            event.stopPropagation()
                                          }
                                        >
                                          {link.label}
                                        </a>
                                        {index < resourceLinks.length - 1 ? ", " : ""}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {showTaskDetails ? (
                                  zenModeEnabled ? (
                                    <p
                                      className={cn(
                                        "text-[11px] text-muted-foreground lowercase",
                                        isZenLeadTask && "text-muted-foreground/90",
                                      )}
                                    >
                                      {displayZenTaskMeta(todo)}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      {displayPriority(todo.priority)} /{" "}
                                      {displayEstimatedHours(todo.estimatedHours)}{" "}
                                      / due: {displayDueDate(todo.dueDate)} /{" "}
                                      {displayRecurrence(todo.recurrence)} /{" "}
                                      {displayTimeBlock(
                                        todo.timeBlockStart,
                                        todo.estimatedHours,
                                      )}
                                    </p>
                                  )
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    {displayPriority(todo.priority)} /{" "}
                                    {displayEstimatedHours(todo.estimatedHours)}{" "}
                                    /{" "}
                                    {displayTimeBlock(
                                      todo.timeBlockStart,
                                      todo.estimatedHours,
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                            {editingTodoId === todo.id ? (
                              <div
                                className="ml-0 flex flex-col gap-2"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-full border-border/70 bg-background/80 px-3 text-[0.8rem] font-medium sm:w-auto"
                                  disabled={pendingTodoId === todo.id}
                                  render={<Link href={getTodoPageHref(todo)} />}
                                >
                                  edit note
                                </Button>
                                <Input
                                  type="text"
                                  value={editingLinksInput}
                                  onChange={(event) =>
                                    setEditingLinksInput(event.target.value)
                                  }
                                  placeholder="https://meet..., https://docs..."
                                  className="h-7 w-full text-[0.8rem] sm:w-72"
                                  disabled={pendingTodoId === todo.id}
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void updateTodoLinks(todo);
                                      event.currentTarget.blur();
                                    }

                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      setEditingLinksInput(todoMeta.linksInputValue);
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  onBlur={() => {
                                    void updateTodoLinks(todo);
                                  }}
                                  aria-label="Task links"
                                />
                                <Popover>
                                  <PopoverTrigger
                                    render={
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                          "w-full justify-start sm:w-44",
                                          !todo.dueDate &&
                                            "text-muted-foreground",
                                        )}
                                        disabled={pendingTodoId === todo.id}
                                      />
                                    }
                                  >
                                    {displayDateInputValue(todo.dueDate)}
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto gap-0 rounded-md bg-background p-1 shadow-none">
                                    <Calendar
                                      className="rounded-sm border border-border"
                                      mode="single"
                                      selected={
                                        todo.dueDate
                                          ? (dateKeyToLocalDate(
                                              getTodoDateKey(todo.dueDate) ??
                                                "",
                                            ) ?? undefined)
                                          : undefined
                                      }
                                      onSelect={(date) =>
                                        void updateTodoDate(
                                          todo,
                                          date
                                            ? format(date, "yyyy-MM-dd")
                                            : "",
                                        )
                                      }
                                    />
                                  </PopoverContent>
                                </Popover>
                                <Input
                                  type="text"
                                  defaultValue={formatEstimatedHoursInput(
                                    todo.estimatedHours,
                                  )}
                                  placeholder="15m / 1h / 1h 30m"
                                  className="h-7 w-full text-[0.8rem] sm:w-36"
                                  disabled={pendingTodoId === todo.id}
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void updateTodoEstimatedHours(
                                        todo,
                                        event.currentTarget.value,
                                      );
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  onBlur={(event) => {
                                    void updateTodoEstimatedHours(
                                      todo,
                                      event.currentTarget.value,
                                    );
                                  }}
                                  aria-label="Estimated duration"
                                />
                                <Combobox
                                  items={TIME_BLOCK_CLOCK_OPTIONS}
                                  value={
                                    TIME_BLOCK_CLOCK_OPTIONS.find(
                                      (option) =>
                                        option.value ===
                                        displayTimeBlockClockValue(
                                          todo.timeBlockStart,
                                        ),
                                    ) ?? null
                                  }
                                  itemToStringValue={(option) => option.label}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      scrollTimeComboboxNearCurrentTime();
                                    }
                                  }}
                                  onValueChange={(option) => {
                                    void updateTodoTimeBlockStart(
                                      todo,
                                      option?.value ?? "",
                                    );
                                  }}
                                >
                                  <ComboboxInput
                                    className="w-full border border-input sm:w-36 [&_[data-slot=input-group-control]]:text-[0.8rem]"
                                    placeholder="--:--"
                                    disabled={pendingTodoId === todo.id}
                                  />
                                  <ComboboxContent
                                    className="border border-input"
                                    data-time-block-combobox="1"
                                  >
                                    <ComboboxEmpty>no times found.</ComboboxEmpty>
                                    <ComboboxList>
                                      {(option) => (
                                        <ComboboxItem
                                          key={option.value}
                                          value={option}
                                        >
                                          {option.label}
                                        </ComboboxItem>
                                      )}
                                    </ComboboxList>
                                  </ComboboxContent>
                                </Combobox>
                                <ToggleGroup
                                  multiple={false}
                                  value={[String(todo.priority)]}
                                  onValueChange={(values) =>
                                    void updateTodoPriority(todo, values)
                                  }
                                  variant="default"
                                  size="sm"
                                >
                                  <ToggleGroupItem
                                    value="1"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    p1
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value="2"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    p2
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value="3"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    p3
                                  </ToggleGroupItem>
                                </ToggleGroup>
                                <ToggleGroup
                                  multiple={false}
                                  value={[todo.recurrence]}
                                  onValueChange={(values) =>
                                    void updateTodoRecurrence(todo, values)
                                  }
                                  variant="default"
                                  size="sm"
                                >
                                  <ToggleGroupItem
                                    value="none"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    once
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value="daily"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    daily
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value="weekly"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    weekly
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value="monthly"
                                    className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                                  >
                                    monthly
                                  </ToggleGroupItem>
                                </ToggleGroup>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={pendingTodoId === todo.id}
                                  onClick={() => {
                                    setTodoPendingDelete(todo);
                                  }}
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  delete
                                </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </main>
        </SidebarInset>
        <Dialog
          open={isCommandCenterOpen}
          onOpenChange={setIsCommandCenterOpen}
        >
          <DialogContent className="max-w-md gap-3">
            <DialogHeader>
              <DialogTitle>command center</DialogTitle>
              <DialogDescription>
                Run common IBX actions without leaving the current view.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="search todos"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCommandCenterOpen(false);
                    promptInputRef.current?.focus();
                  }}
                >
                  create todo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveFilter("archive");
                    setIsCommandCenterOpen(false);
                  }}
                >
                  open archive
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCommandCenterOpen(false);
                    setIsArchiveCleanupOpen(true);
                  }}
                >
                  clean archive
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCommandCenterOpen(false);
                    openTerminal();
                  }}
                >
                  terminal mode
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const firstTodo = visibleTodos[0];
                    if (firstTodo) {
                      setEditingTodoId(firstTodo.id);
                      setEditingTitleInput(firstTodo.title);
                      setEditingLinksInput(
                        getTodoDisplayMeta(firstTodo.notes).linksInputValue,
                      );
                      setIsCommandCenterOpen(false);
                    }
                  }}
                >
                  edit first
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCommandCenterOpen(false)}
                  render={<Link href="/settings" prefetch={false} />}
                >
                  settings
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {isTerminalRendered ? (
          <div
            className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-900 bg-black shadow-2xl will-change-transform"
            style={{
              opacity: isTerminalOpen ? 1 : 0,
              transform: isTerminalOpen
                ? "translate3d(0, 0, 0)"
                : "translate3d(0, 100%, 0)",
              transition:
                "transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
            }}
            role="dialog"
            aria-label="IBX terminal"
          >
            <div className="flex h-[44vh] min-h-72 w-full flex-col px-4 py-3 md:px-6">
              <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[0.72rem] text-neutral-500">
                <span>ibx terminal // help, pwd, ls, cd, search, create, open, done, delete</span>
                <button
                  type="button"
                  className="text-neutral-500 transition-colors hover:text-neutral-100"
                  onClick={closeTerminal}
                >
                  close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap text-neutral-100">
                {terminalLines.map(renderTerminalLine)}
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">$</span>
                <Input
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void runTerminalCommand();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeTerminal();
                    }
                  }}
                  placeholder="ls"
                  autoFocus
                    className="h-5 flex-1 border-0 bg-transparent px-0 py-0 font-mono text-xs text-neutral-100 shadow-none placeholder:text-neutral-600 focus-visible:ring-0"
                />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <AlertDialog
          open={isArchiveCleanupOpen}
          onOpenChange={setIsArchiveCleanupOpen}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>clean archive?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes completed todos only. Active todos are
                not touched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void cleanupArchivedTodos();
                }}
              >
                clean archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={todoPendingDelete !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setTodoPendingDelete(null);
            }
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>delete todo?</AlertDialogTitle>
              <AlertDialogDescription>
                this permanently removes{" "}
                {todoPendingDelete?.title ?? "this todo"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendingTodoId !== null}>
                cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={pendingTodoId !== null}
                onClick={() => {
                  void confirmDeleteTodo();
                }}
              >
                delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>

      <Toaster position="bottom-right" />
    </>
  );
}
