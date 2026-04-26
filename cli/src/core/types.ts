export type TodoStatus = "open" | "done";
export type TodoRecurrence = "none" | "daily" | "weekly" | "monthly";
export type TodoPriority = 1 | 2 | 3;
export type ViewMode = "today" | "upcoming" | "archive" | "all";

export type TodoItem = {
  id: string;
  thoughtId: string;
  title: string;
  notes: string | null;
  status: TodoStatus;
  dueDate: number | null;
  estimatedHours: number | null;
  timeBlockStart: number | null;
  priority: TodoPriority;
  recurrence: TodoRecurrence;
  source: "ai" | "manual";
  createdAt: number;
};

export type CliConfig = {
  baseUrl: string;
  apiKey: string;
  createdAt: string;
};

export type CliVersionManifest = {
  version?: unknown;
};

export type UpdateCheckCache = {
  lastCheckedAt: number;
  baseUrl: string;
  latestVersion: string | null;
  lastNotifiedVersion: string | null;
};

export type ParsedArgs = {
  positionals: string[];
  options: Record<string, string | boolean>;
};
