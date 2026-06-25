export type ThoughtStatus = "pending" | "processing" | "done" | "failed";

export type SyncStatus = "local-only" | "syncing" | "synced" | "error";

export type TodoStatus = "open" | "done";
export type TodoRecurrence = "none" | "daily" | "weekly" | "monthly";
export type TodoSource = "ai" | "manual";
export type TodoPriority = 1 | 2 | 3;

export type GenerationPreferences = {
  autoSchedule: boolean;
  includeRelevantLinks: boolean;
  requireTaskDescriptions: boolean;
  availabilityNotes: string | null;
  executionSpeedMultiplier: number;
};

export type TodoItem = {
  id: string;
  thoughtId: string;
  title: string;
  notes: string | null;
  notesJson: string | null;
  notesHtml: string | null;
  status: TodoStatus;
  dueDate: number | null;
  estimatedHours: number | null;
  timeBlockStart: number | null;
  priority: TodoPriority;
  recurrence: TodoRecurrence;
  source: TodoSource;
  createdAt: number;
};

export type ThoughtRecord = {
  externalId: string;
  rawText: string;
  createdAt: number;
  status: ThoughtStatus;
  synced: boolean;
  aiRunId: string | null;
};

export type LocalThought = ThoughtRecord & {
  syncStatus: SyncStatus;
  lastError: string | null;
};

export type SyncThoughtInput = {
  externalId: string;
  rawText: string;
  createdAt: number;
  status: ThoughtStatus;
  aiRunId: string | null;
};

export type AttachmentParentKind = "thought" | "todo";

export type AttachmentRecord = {
  id: string;
  parentKind: AttachmentParentKind;
  parentId: string;
  fileName: string;
  contentType: string;
  size: number;
  status: "uploaded";
  createdAt: number;
  updatedAt: number;
};

export type PublicationRecord = {
  id: string;
  sourceKind: "todo" | "thought";
  sourceId: string;
  target: "bri";
  remoteId: string;
  username: string;
  slug: string;
  title: string;
  url: string;
  visibility: "public" | "private";
  status: "published" | "deleted";
  createdAt: number;
  updatedAt: number;
  lastPublishedAt: number;
  deletedAt: number | null;
};

export type BriConnectionRecord = {
  id: string;
  keyPrefix: string;
  keyLast4: string;
  createdAt: number;
  updatedAt: number;
  verifiedAt: number;
  lastError: string | null;
};
