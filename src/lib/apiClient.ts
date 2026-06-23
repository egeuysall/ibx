import type {
  AttachmentParentKind,
  AttachmentRecord,
  GenerationPreferences,
  TodoItem,
  SyncThoughtInput,
  ThoughtRecord,
  TodoPriority,
  TodoRecurrence,
  TodoStatus,
} from "@/lib/types";

type ApiErrorPayload = { error?: string };
type RequestJsonOptions = {
  timeoutMs?: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const UNAUTHORIZED_EVENT_NAME = "ibx:unauthorized";
export const NETWORK_STATUS_EVENT_NAME = "ibx:network-status";

function parseRetryAfterSeconds(retryAfterHeader: string | null) {
  if (!retryAfterHeader) {
    return undefined;
  }

  const asSeconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds;
  }

  const asDate = Date.parse(retryAfterHeader);
  if (!Number.isFinite(asDate)) {
    return undefined;
  }

  const diffSeconds = Math.ceil((asDate - Date.now()) / 1000);
  return diffSeconds > 0 ? diffSeconds : undefined;
}

function emitUnauthorizedEvent(message?: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(UNAUTHORIZED_EVENT_NAME, {
      detail: {
        message,
      },
    }),
  );
}

function emitNetworkStatusEvent(online: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(NETWORK_STATUS_EVENT_NAME, {
      detail: { online },
    }),
  );
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class ApiError extends Error {
  status: number;
  retryAfterSeconds?: number;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    status: number,
    options: {
      retryAfterSeconds?: number;
      isNetworkError?: boolean;
      isTimeout?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.isNetworkError = options.isNetworkError ?? false;
    this.isTimeout = options.isTimeout ?? false;
  }
}

async function requestJson<T>(
  input: string,
  init?: RequestInit,
  options: RequestJsonOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort("timeout");
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(input, {
      credentials: "include",
      ...init,
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    emitNetworkStatusEvent(false);
    const timedOut = timeoutController.signal.aborted;
    if (timedOut) {
      throw new ApiError("Request timed out. Please try again.", 0, {
        isNetworkError: true,
        isTimeout: true,
      });
    }

    throw new ApiError(
      "Network error. Check your connection and try again.",
      0,
      { isNetworkError: true },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const retryAfterSeconds = parseRetryAfterSeconds(
    response.headers.get("retry-after"),
  );
  emitNetworkStatusEvent(true);
  const json = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;

  if (!response.ok) {
    if (response.status === 401) {
      emitUnauthorizedEvent(json.error);
    }

    throw new ApiError(json.error || "Request failed.", response.status, {
      retryAfterSeconds,
    });
  }

  return json as T;
}

export const apiClient = {
  async login(password: string) {
    return requestJson<{ ok: true }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  async logout() {
    return requestJson<{ ok: true }>("/api/logout", { method: "POST" });
  },

  async session() {
    return requestJson<{ authenticated: boolean; expiresAt: number | null }>(
      "/api/session",
      { method: "GET" },
    );
  },

  async listThoughts() {
    return requestJson<{ thoughts: ThoughtRecord[] }>("/api/thoughts", {
      method: "GET",
    });
  },

  async syncThoughts(thoughts: SyncThoughtInput[]) {
    return requestJson<{ thoughts: ThoughtRecord[] }>("/api/thoughts/sync", {
      method: "POST",
      body: JSON.stringify({ thoughts }),
    });
  },

  async listTodos(externalId: string) {
    const today = getLocalDateKey();
    return requestJson<{ todos: TodoItem[] }>(`/api/thoughts/${externalId}/todos?today=${today}`, {
      method: "GET",
    });
  },

  async createTodo(externalId: string, title: string, notes: string | null) {
    return requestJson<{ ok: true }>(`/api/thoughts/${externalId}/todos`, {
      method: "POST",
      body: JSON.stringify({ title, notes }),
    });
  },

  async createManualTodo(title: string) {
    return requestJson<{ ok: true; id: string; thoughtId: string }>("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title, priority: 1 }),
    });
  },

  async generateTodos(
    externalId: string,
    preferences?: GenerationPreferences,
  ) {
    const today = getLocalDateKey();
    return requestJson<{ ok: true; created: number }>(
      `/api/thoughts/${externalId}/generate`,
      {
        method: "POST",
        body: JSON.stringify({ today, preferences }),
      },
    );
  },

  async listAllTodos() {
    const today = getLocalDateKey();
    return requestJson<{ todos: TodoItem[] }>(`/api/todos?today=${today}`, {
      method: "GET",
    });
  },

  async getTodo(todoId: string) {
    return requestJson<{ todo: TodoItem }>(`/api/todos/${todoId}`, {
      method: "GET",
    });
  },

  async syncPush(input: {
    clientId: string;
    ops: Array<{
      opId: string;
      clientId: string;
      entityType: "todo";
      entityId: string;
      operation: "create" | "update" | "delete" | "toggle";
      baseVersion?: number | null;
      createdAt: number;
      payload: Record<string, unknown>;
    }>;
  }) {
    return requestJson<{
      accepted: Array<{
        opId: string;
        entityId: string;
        serverId: string | null;
        status: "accepted" | "rejected" | "conflict";
        message: string | null;
      }>;
      rejected: Array<{ opId: string; entityId: string; message: string }>;
      conflicts: Array<{
        opId: string;
        entityId: string;
        serverId: string;
        message: string;
        serverVersion: number;
      }>;
      serverNow: number;
    }>("/api/sync", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async syncPull(since: number | null) {
    const query = since === null ? "" : `?since=${encodeURIComponent(String(since))}`;
    return requestJson<{ todos: TodoItem[]; serverNow: number }>(`/api/sync${query}`, {
      method: "GET",
    });
  },

  async generateTodosFromInput(
    text: string,
    preferences?: GenerationPreferences,
  ) {
    const today = getLocalDateKey();
    return requestJson<{
      ok: true;
      runId: string;
      created: number;
      updated?: number;
      deleted?: number;
      droppedMutationOps?: number;
      mode?: "create" | "mutate";
      message?: string | null;
    }>("/api/todos/generate", {
      method: "POST",
      body: JSON.stringify({ text, today, preferences }),
    });
  },

  async listApiKeys() {
    return requestJson<{
      keys: Array<{
        id: string;
        name: string;
        prefix: string;
        last4: string;
        permission: "read" | "write" | "both";
        createdAt: number;
      }>;
    }>("/api/api-keys", {
      method: "GET",
    });
  },

  async createApiKey(name: string, permission: "read" | "write" | "both" = "both") {
    return requestJson<{
      ok: true;
      apiKey: string;
      key: {
        id: string;
        name: string;
        prefix: string;
        last4: string;
        permission: "read" | "write" | "both";
      };
    }>("/api/api-keys", {
      method: "POST",
      body: JSON.stringify({ name, permission }),
    });
  },

  async revokeApiKey(keyId: string) {
    return requestJson<{ ok: true }>(`/api/api-keys/${keyId}`, {
      method: "DELETE",
    });
  },

  async getCalendarFeedStatus() {
    return requestJson<{
      activeFeed: {
        id: string;
        name: string;
        prefix: string;
        last4: string;
        createdAt: number;
      } | null;
    }>("/api/calendar/feed-token", {
      method: "GET",
    });
  },

  async rotateCalendarFeedToken() {
    return requestJson<{
      ok: true;
      feedUrl: string;
      feed: {
        id: string;
        name: string;
        prefix: string;
        last4: string;
        createdAt: number;
      };
    }>("/api/calendar/feed-token", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async updateTodo(
    todoId: string,
    payload: {
      status?: TodoStatus;
      dueDate?: string | null;
      estimatedHours?: number | null;
      timeBlockStart?: number | null;
      recurrence?: TodoRecurrence;
      priority?: TodoPriority;
      title?: string;
      notes?: string | null;
      notesJson?: unknown;
      notesHtml?: string | null;
    },
  ) {
    return requestJson<{ ok: true }>(`/api/todos/${todoId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteTodo(todoId: string) {
    return requestJson<{ ok: true }>(`/api/todos/${todoId}`, {
      method: "DELETE",
    });
  },

  async listAttachments(parentKind: AttachmentParentKind, parentId: string) {
    const query = new URLSearchParams({ parentKind, parentId });
    return requestJson<{ attachments: AttachmentRecord[] }>(
      `/api/attachments?${query.toString()}`,
      { method: "GET" },
    );
  },

  async createAttachment(input: {
    parentKind: AttachmentParentKind;
    parentId: string;
    storageId: string;
    fileName: string;
    contentType: string;
    size: number;
  }) {
    return requestJson<{ ok: true; id: string }>("/api/attachments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async createAttachmentUploadUrl() {
    return requestJson<{
      uploadUrl: string;
      limits: { maxBytes: number; allowedContentTypes: string[] };
    }>("/api/attachments/upload-url", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async getAttachmentUrl(attachmentId: string) {
    return requestJson<{ url: string }>(`/api/attachments/${attachmentId}/url`, {
      method: "GET",
    });
  },

  async deleteAttachment(attachmentId: string) {
    return requestJson<{ ok: true }>(`/api/attachments/${attachmentId}`, {
      method: "DELETE",
    });
  },

  async uploadAttachmentFile(input: {
    parentKind: AttachmentParentKind;
    parentId: string;
    file: File;
  }) {
    const { uploadUrl, limits } = await this.createAttachmentUploadUrl();
    if (input.file.size > limits.maxBytes) {
      throw new ApiError("Attachment file is too large.", 400);
    }

    const contentType = input.file.type || "application/octet-stream";
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: input.file,
    });
    const uploadJson = (await uploadResponse.json().catch(() => ({}))) as {
      storageId?: unknown;
    };
    if (!uploadResponse.ok || typeof uploadJson.storageId !== "string") {
      throw new ApiError("Attachment upload failed.", uploadResponse.status || 500);
    }

    return await this.createAttachment({
      parentKind: input.parentKind,
      parentId: input.parentId,
      storageId: uploadJson.storageId,
      fileName: input.file.name,
      contentType,
      size: input.file.size,
    });
  },
};
